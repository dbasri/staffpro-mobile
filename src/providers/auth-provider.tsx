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

  const logout = useCallback(() => {
    console.log('AUTH_DIAG: Logout initiated. Clearing state and reloading origin...');
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('AUTH_DIAG: Error clearing localStorage:', error);
    }
    setUser(null);
    handshakeCompletedRef.current = false;
    
    if (typeof window !== 'undefined') {
      console.log('AUTH_DIAG: Hard redirect to:', window.location.origin);
      window.location.replace(window.location.origin);
    }
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
    console.log('AUTH_DIAG: Message listener is ACTIVE and waiting for events...');
    
    const handleServerMessage = (event: MessageEvent) => {
      // THIS LOG SHOULD TRIGGER FOR EVERY MESSAGE
      console.log('AUTH_DIAG: Received postMessage event from origin:', event.origin);
      
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        console.log('AUTH_DIAG: Decoded message data:', data);
      } catch (e) {
        data = event.data;
        console.log('AUTH_DIAG: Raw (non-JSON) message data:', data);
      }

      if (!data || typeof data !== 'object') {
        console.log('AUTH_DIAG: Ignored message (not an object).');
        return;
      }

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).trim() : '';

      // Check for remote logoff request
      if (status === 'logoff') {
        console.log('AUTH_DIAG: "logoff" status detected! Triggering logout sequence.');
        logoutRef.current();
        return;
      }

      // Handle successful authentication
      if (
        status === 'success' &&
        purpose === 'Authenticated' &&
        !handshakeCompletedRef.current
      ) {
        console.log('AUTH_DIAG: Authentication success. Updating user state.');
        handshakeCompletedRef.current = true;
        try {
          setUserRef.current(data);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
          console.error('AUTH_DIAG: Failed to save session:', error);
        }
      } else if (status === 'fail') {
        console.log('AUTH_DIAG: Authentication failure reported by server.');
        toastRef.current({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: data.purpose || 'Check server credentials.',
        });
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => {
      console.log('AUTH_DIAG: Message listener is being REMOVED.');
      window.removeEventListener('message', handleServerMessage);
    };
  }, []);

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        if (session.status === 'success' && session.purpose === 'Authenticated') {
          console.log('AUTH_DIAG: Restored existing session for:', session.email);
          setUser(session);
          handshakeCompletedRef.current = true;
        }
      }
    } catch (error) {
      console.error('AUTH_DIAG: Restore error:', error);
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
