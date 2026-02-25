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

  // This ref tracks if the initial authentication from postMessage has happened.
  const handshakeCompletedRef = useRef(false);

  // Use refs to allow the stable listener to call the latest functions without re-mounting
  const setUserRef = useRef(setUser);
  const toastRef = useRef(toast);
  
  const logout = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('Could not access local storage to clear session:', error);
    }
    setUser(null);
    handshakeCompletedRef.current = false; // Reset on logout to allow fresh login
    // Redirect to the home startup screen (root)
    window.location.href = '/';
  }, []);

  const logoutRef = useRef(logout);

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
        console.error('Could not access local storage to save session:', error);
        toast({
          variant: 'destructive',
          title: 'Login Error',
          description: 'Could not save session to device.',
        });
      }
    },
    [toast]
  );

  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      // IMPORTANT: In production, validate event.origin for security.
      
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (e) {
        return;
      }

      if (!data || typeof data !== 'object') return;

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).trim() : '';

      // Check for remote logoff request
      if (status === 'logoff') {
        logoutRef.current();
        return;
      }

      if (
        status === 'success' &&
        purpose === 'Authenticated' &&
        !handshakeCompletedRef.current
      ) {
        handshakeCompletedRef.current = true;
        try {
          setUserRef.current(data);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
          console.error('Could not access local storage to save session:', error);
        }
      } else if (status === 'fail') {
        const description = data.purpose || 'An unknown error occurred on the server.';

        toastRef.current({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: description,
        });

        // If verification code failed, redirect back to start
        if (purpose.includes('Verify') || purpose.includes('Verification')) {
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
        }
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
        if (session.status === 'success' && session.purpose === 'Authenticated') {
          setUser(session);
          handshakeCompletedRef.current = true;
        }
      }
    } catch (error) {
      console.error('Could not access local storage or parse session:', error);
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
