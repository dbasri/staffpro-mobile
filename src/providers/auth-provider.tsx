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
      console.log('DEBUG: RAW MESSAGE RECEIVED AT WINDOW:', {
        origin: event.origin,
        data: event.data,
        dataType: typeof event.data
      });

      let data = event.data;
      
      if (typeof data === 'string') {
        try {
          const start = data.indexOf('{');
          const end = data.lastIndexOf('}');
          if (start !== -1 && end !== -1) {
            const jsonPart = data.substring(start, end + 1);
            data = JSON.parse(jsonPart);
            console.log('DEBUG: PARSED JSON PAYLOAD:', data);
          } else {
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
        if (purpose.includes('verify') || purpose.includes('code')) {
          console.log('DEBUG: SETTING INVALID CODE ERROR');
          setAuthError('invalid-code');
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
          console.log('DEBUG: SUCCESS MESSAGE RECEIVED BUT NOT FOR AUTHENTICATION');
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
