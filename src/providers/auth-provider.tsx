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
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
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

/**
 * Simple helper to derive a readable device name from User Agent.
 */
function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS Device';
  if (/Android/.test(ua)) return 'Android Device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux Device';
  return 'Mobile/Web Browser';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const isAuthenticated = !!user;

  const login = useCallback((sessionData: UserSession) => {
    console.log('AUTH: Logging in user:', sessionData.email);
    setUser(sessionData);
    setAuthError(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('AUTH: Failed to persist session.');
    }
  }, []);

  const logout = useCallback(() => {
    console.log('AUTH: Logging out');
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

  // Listener for Iframe postMessage (used for Code Verification flow)
  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      let data = event.data;
      
      // Robust JSON extraction
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

      if (status === 'logoff' || purpose === 'logoff') {
        logoutRef.current();
        return;
      }

      // Handle the server's "Code invalid" workaround where status is success
      const isInvalidPurpose = 
        purpose.includes('invalid') || 
        purpose.includes('error') || 
        purpose.includes('incorrect') ||
        purpose.includes('fail');
      
      if (status === 'fail' || (status === 'success' && isInvalidPurpose)) {
        setAuthError('invalid-code');
        return;
      }

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

  // Restore session on mount
  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        if (session.status === 'success') {
          setUser(session);
        }
      }
    } catch (error) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Passkey Login/Registration flow (Direct POST/JSON, no iframe)
  const passkeyLogin = useCallback(async (email: string) => {
    try {
      console.log('PASSKEY: Starting flow for', email);
      setAuthError(null);
      const deviceName = getDeviceName();
      
      // 1. Get options from server via POST
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      
      // DIAGNOSTIC: Log the raw response structure
      console.log('PASSKEY: Raw options keys:', Object.keys(responseData));

      // Standard unwrapping: if the library produced a "publicKey" envelope, use it.
      // Otherwise, assume the response itself is the options object.
      let options = responseData.publicKey || responseData;
      
      console.log('PASSKEY: Ceremony Options Object:', JSON.stringify(options, null, 2));

      if (!options.challenge) {
        console.error('PASSKEY: Critical error - "challenge" is missing in options object.');
        throw new Error('Server response missing "challenge" property.');
      }

      let credentialResponse;

      // Determine if server wants Registration or Authentication
      // Registration options contain 'user' and 'pubKeyCredParams'
      const isRegistration = !!(options.user && options.pubKeyCredParams);
      
      if (isRegistration) {
        console.log('PASSKEY: Detected Registration Options. Calling startRegistration...');
        credentialResponse = await startRegistration(options);
      } else {
        console.log('PASSKEY: Detected Authentication Options. Calling startAuthentication...');
        credentialResponse = await startAuthentication(options);
      }
      
      console.log('PASSKEY: Browser ceremony successful. Sending response to server...');
      
      // 3. Verify response with server via POST
      const result = await AuthApi.verifyPasskey(credentialResponse, email, deviceName);
      
      if (result.status === 'success') {
        console.log('PASSKEY: Authentication successful!');
        login({ ...result, method: 'passkey' });
      } else {
        throw new Error(result.purpose || 'Passkey verification failed.');
      }
    } catch (error: any) {
      console.error('PASSKEY: Error in passkeyLogin flow:', error);
      
      let errorMessage = error.message || 'Could not sign in with passkey.';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Passkey authentication was cancelled or timed out.';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'The domain is not authorized for this passkey.';
      } else if (error.name === 'TypeError') {
        errorMessage = 'Invalid data received from server. Check console for details.';
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
