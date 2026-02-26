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

  const handshakeCompletedRef = useRef(false);
  
  const login = useCallback((sessionData: UserSession) => {
    setUser(sessionData);
    setAuthError(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('AUTH: Failed to persist session.');
    }
    handshakeCompletedRef.current = true;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('AUTH: Error clearing storage:', error);
    }
    setUser(null);
    setAuthError(null);
    handshakeCompletedRef.current = false;
    
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
      let data = event.data;
      console.log("AUTH_DIAG: RAW MESSAGE RECEIVED", { origin: event.origin, data });

      if (typeof data === 'string') {
        try {
          const start = data.indexOf('{');
          const end = data.lastIndexOf('}');
          if (start !== -1 && end !== -1) {
            const jsonPart = data.substring(start, end + 1);
            data = JSON.parse(jsonPart);
            console.log("AUTH_DIAG: PARSED JSON PAYLOAD", data);
          } else {
            return;
          }
        } catch (e) {
          console.error("AUTH_DIAG: JSON PARSE ERROR", e);
          return;
        }
      }

      if (!data || typeof data !== 'object') return;

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).toLowerCase() : '';

      if (status === 'logoff') {
        logoutRef.current();
        return;
      }

      if (status === 'fail' && (purpose.includes('verify') || purpose.includes('code'))) {
        console.log("AUTH_DIAG: FAIL DETECTED, setting invalid-code error");
        setAuthError('invalid-code');
        return;
      }

      if (
        status === 'success' &&
        (purpose === 'authenticated' || purpose.includes('verify')) &&
        !handshakeCompletedRef.current
      ) {
        loginRef.current(data);
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => window.removeEventListener('message', handleServerMessage);
  }, []);

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        if (session.status === 'success' && (session.purpose === 'Authenticated' || session.purpose === 'authenticated')) {
          setUser(session);
          handshakeCompletedRef.current = true;
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