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
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (sessionData: UserSession) => void;
  passkeyLogin: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_STORAGE_KEY = 'staffpro-session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const isAuthenticated = !!user;

  const handshakeCompletedRef = useRef(false);
  const setUserRef = useRef(setUser);
  const toastRef = useRef(toast);

  // Robust logout that clears everything and forces a reload to the startup screen
  const logout = useCallback(() => {
    console.log('AUTH: Logout initiated.');
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('AUTH: Error clearing storage:', error);
    }
    setUser(null);
    handshakeCompletedRef.current = false;
    
    if (typeof window !== 'undefined') {
      // Use replace to prevent "Back" button from returning to authenticated state
      window.location.replace(window.location.origin);
    }
  }, []);

  const logoutRef = useRef(logout);

  // Keep refs in sync for the event listener closure
  useEffect(() => {
    setUserRef.current = setUser;
    toastRef.current = toast;
    logoutRef.current = logout;
  });

  const login = useCallback(
    (sessionData: UserSession) => {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
        setUser(sessionData);
        handshakeCompletedRef.current = true;
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Login Error',
          description: 'Could not save session to device.',
        });
      }
    },
    [toast]
  );

  // Handle incoming messages from the embedded content
  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (e) {
        data = event.data;
      }

      if (!data || typeof data !== 'object') return;

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).trim() : '';

      // Detection for server-initiated logoff
      if (status === 'logoff') {
        console.log('AUTH: Logoff message detected from server.');
        logoutRef.current();
        return;
      }

      // Initial authentication handshake
      if (
        status === 'success' &&
        purpose === 'Authenticated' &&
        !handshakeCompletedRef.current
      ) {
        console.log('AUTH: Authentication successful.');
        handshakeCompletedRef.current = true;
        try {
          setUserRef.current(data);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
          console.error('AUTH: Failed to persist session.');
        }
      } else if (status === 'fail') {
        toastRef.current({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: data.purpose || 'Please check your credentials.',
        });
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => window.removeEventListener('message', handleServerMessage);
  }, []);

  // Restore session on app load
  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        if (session.status === 'success' && session.purpose === 'Authenticated') {
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
      value={{ user, isAuthenticated, isLoading, login, passkeyLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
