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
  const isAuthenticated = !!user;

  // Track state in refs for use inside the event listener to avoid stale closures
  const authErrorRef = useRef<string | null>(null);
  
  const login = useCallback((sessionData: UserSession) => {
    setUser(sessionData);
    setAuthError(null);
    authErrorRef.current = null;
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
    authErrorRef.current = null;
    
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
    console.log('DEBUG: APP INITIALIZED. ORIGIN:', window.location.origin);

    const handleServerMessage = (event: MessageEvent) => {
      // LOG EVERY MESSAGE RECEIVED
      console.log('DEBUG: RAW MESSAGE RECEIVED AT WINDOW:', {
        origin: event.origin,
        data: event.data,
        dataType: typeof event.data
      });

      let data = event.data;
      
      // Robust JSON extraction
      if (typeof data === 'string') {
        try {
          const jsonMatch = data.match(/\{.*\}/);
          if (jsonMatch) {
            data = JSON.parse(jsonMatch[0]);
            console.log('DEBUG: EXTRACTED JSON PAYLOAD:', data);
          } else {
            console.log('DEBUG: MESSAGE IS STRING BUT NO JSON DETECTED');
            return;
          }
        } catch (e) {
          console.log('DEBUG: JSON PARSE ERROR:', e);
          return;
        }
      }

      if (!data || typeof data !== 'object') {
        return;
      }

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).toLowerCase() : '';

      console.log('DEBUG: ANALYZING MESSAGE:', { status, purpose });

      if (status === 'logoff') {
        console.log('DEBUG: INITIATING LOGOFF PER SERVER REQUEST');
        logoutRef.current();
        return;
      }

      if (status === 'fail') {
        console.log('DEBUG: FAILURE STATUS DETECTED');
        if (purpose.includes('verify') || purpose.includes('code')) {
          console.log('DEBUG: SETTING INVALID CODE ERROR');
          setAuthError('invalid-code');
          authErrorRef.current = 'invalid-code';
        }
        return;
      }

      if (status === 'success') {
        const isEmailSentOnly = purpose.includes('email') && (purpose.includes('send') || purpose.includes('sent'));
        const isActuallyAuthenticated = 
          purpose === 'authenticated' || 
          (purpose.includes('verify') && !isEmailSentOnly);

        if (isActuallyAuthenticated) {
          console.log('DEBUG: AUTHENTICATION SUCCESSFUL, LOGGING IN');
          loginRef.current(data);
        } else {
          console.log('DEBUG: SUCCESS MESSAGE RECEIVED BUT NOT FOR AUTHENTICATION (PROBABLY EMAIL SENT)');
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
        if (session.status === 'success' && (session.purpose === 'Authenticated' || session.purpose === 'authenticated')) {
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
    const mockSession: UserSession = {
      status: 'success',
      email: 'passkey-user@example.com',
      name: 'Passkey User',
      session: 'mock-session-id-passkey',
      purpose: 'Authenticated',
    };
    login(mockSession);
  }, [login]);

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
