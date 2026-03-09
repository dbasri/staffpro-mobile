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
  passkeyLogin: (email: string) => Promise<void>;
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
    setUser(sessionData);
    setAuthError(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('AUTH: Failed to persist session.');
    }
  }, []);

  const logout = useCallback(() => {
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

  const logoutRef = useRef(logout);
  const loginRef = useRef(login);

  useEffect(() => {
    logoutRef.current = logout;
    loginRef.current = login;
  }, [logout, login]);

  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      // Only listen to messages from the trusted origin
      // if (event.origin !== 'https://mystaffpro.com') return;

      let data = event.data;
      
      // Attempt to parse JSON if the message is a string (some PHP setups send raw strings)
      if (typeof data === 'string') {
        try {
          // Look for JSON pattern within the string
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

      // Normalize fields for comparison
      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).toLowerCase() : '';

      // Handle explicit logoff
      if (status === 'logoff' || purpose === 'logoff') {
        logoutRef.current();
        return;
      }

      // Handle verification failures (e.g. status "fail" or purpose "Code invalid")
      const isInvalidPurpose = purpose.includes('invalid') || purpose.includes('error') || purpose.includes('incorrect');
      
      if (status === 'fail' || (status === 'success' && isInvalidPurpose)) {
        setAuthError('invalid-code');
        return;
      }

      // Handle successful authentication from iframe (Code flow)
      if (status === 'success') {
        const isEmailSentOnly = purpose.includes('email') && (purpose.includes('send') || purpose.includes('sent'));
        const isActuallyAuthenticated = 
          purpose === 'authenticated' || 
          (purpose.includes('verify') && !isEmailSentOnly);

        if (isActuallyAuthenticated) {
          loginRef.current({ ...data, method: 'code' });
        } else if (isEmailSentOnly) {
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

  const passkeyLogin = useCallback(async (email: string) => {
    try {
      setAuthError(null);
      
      // 1. Get options from server (POST) with email
      const options = await AuthApi.getPasskeyOptions(email);
      
      // 2. Start WebAuthn ceremony
      const assertion = await startAuthentication(options);
      
      // 3. Verify with server (POST) with email
      const result = await AuthApi.verifyPasskey(assertion, email);
      
      if (result.status === 'success') {
        login({ ...result, method: 'passkey' });
      } else {
        throw new Error(result.purpose || 'Passkey verification failed.');
      }
    } catch (error: any) {
      console.error('Passkey Error:', error);
      
      let errorMessage = error.message || 'Could not sign in with passkey.';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Passkey authentication was cancelled or timed out.';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'The domain is not authorized for this passkey.';
      }

      toast({
        title: 'Authentication Failed',
        description: errorMessage,
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
