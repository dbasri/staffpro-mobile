
'use client';

import {
  useState,
  useEffect,
  createContext,
  type ReactNode,
  useCallback,
  useRef,
} from 'react';
import type { UserSession } from '@/types/session';
import { startAuthentication } from '@simplewebauthn/browser';
import { AuthApi } from '@/lib/auth-api';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  login: (sessionData: UserSession) => void;
  passkeyLogin: () => Promise<void>;
  logout: () => void;
  setAuthError: (error: string | null) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_STORAGE_KEY = 'staffpro-session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const isAuthenticated = !!user;

  const login = useCallback((sessionData: UserSession) => {
    console.log('AUTH: Logging in with session:', sessionData);
    setUser(sessionData);
    setAuthError(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('AUTH: Failed to persist session.');
    }
  }, []);

  const logout = useCallback(() => {
    console.log('AUTH: Logging out...');
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('AUTH: Error clearing storage:', error);
    }
    setUser(null);
    setAuthError(null);
    
    if (typeof window !== 'undefined') {
      window.location.replace(window.location.origin);
    }
  }, []);

  // Use refs to ensure the message listener always uses the latest functions
  const logoutRef = useRef(logout);
  const loginRef = useRef(login);

  useEffect(() => {
    logoutRef.current = logout;
    loginRef.current = login;
  }, [logout, login]);

  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      // Diagnostic log for all incoming messages
      console.log('DEBUG: RAW MESSAGE RECEIVED AT WINDOW:', event.data, 'FROM:', event.origin);

      let data = event.data;
      
      // Attempt to parse string messages as JSON
      if (typeof data === 'string') {
        try {
          const jsonMatch = data.match(/\{.*\}/);
          if (jsonMatch) {
            data = JSON.parse(jsonMatch[0]);
          } else {
            return;
          }
        } catch (e) {
          return;
        }
      }

      if (!data || typeof data !== 'object') return;

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).toLowerCase() : '';

      // Handle explicit logoff command
      if (status === 'logoff' || purpose === 'logoff') {
        logoutRef.current();
        return;
      }

      // Handle the server's workaround: status="success" but purpose indicates error
      const isInvalidPurpose = purpose.includes('invalid') || purpose.includes('error') || purpose.includes('incorrect');
      
      if (status === 'fail' || (status === 'success' && isInvalidPurpose)) {
        console.warn('DEBUG: Verification failure detected:', purpose);
        setAuthError('invalid-code');
        return;
      }

      if (status === 'success') {
        // Distinguish between "email sent" and "successfully verified"
        const isEmailSentOnly = purpose.includes('email') && (purpose.includes('send') || purpose.includes('sent'));
        const isActuallyAuthenticated = 
          purpose === 'authenticated' || 
          (purpose.includes('verify') && !isEmailSentOnly);

        if (isActuallyAuthenticated) {
          console.log('DEBUG: Successful authentication detected.');
          loginRef.current(data);
        } else if (isEmailSentOnly) {
          console.log('DEBUG: Email verification code was sent.');
          setAuthError(null);
        }
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => {
      window.removeEventListener('message', handleServerMessage);
    };
  }, []);

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        if (session.status === 'success' && 
           (session.purpose === 'Authenticated' || session.purpose === 'authenticated')) {
          setUser(session);
        }
      }
    } catch (error) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const passkeyLogin = useCallback(async () => {
    try {
      console.log('AUTH: Starting Passkey Login...');
      setAuthError(null);
      
      // 1. Get options from server (POST)
      const options = await AuthApi.getPasskeyOptions();
      console.log('AUTH: Received Passkey Options:', options);
      
      // 2. Start WebAuthn ceremony
      const assertion = await startAuthentication(options);
      console.log('AUTH: Received Assertion:', assertion);
      
      // 3. Verify with server (POST)
      const result = await AuthApi.verifyPasskey(assertion);
      
      if (result.status === 'success') {
        login(result);
      } else {
        throw new Error(result.purpose || 'Passkey verification failed.');
      }
    } catch (error: any) {
      console.error('Passkey Error:', error);
      toast({
        title: 'Authentication Failed',
        description: error.message || 'Could not sign in with passkey.',
        variant: 'destructive',
      });
    }
  }, [login, toast]);

  return (
    <AuthContext.Provider
      value={{ 
        user, 
        isAuthenticated, 
        isLoading, 
        authError,
        login, 
        passkeyLogin, 
        logout,
        setAuthError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
