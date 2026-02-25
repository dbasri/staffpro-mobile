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
    console.log('AUTH: Logout function called. Clearing storage and redirecting...');
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('AUTH: Error removing session from localStorage:', error);
    }
    setUser(null);
    handshakeCompletedRef.current = false;
    
    // Perform a hard restart to the root origin to clear all state and URL params
    if (typeof window !== 'undefined') {
      console.log('AUTH: Hard redirecting to origin:', window.location.origin);
      window.location.replace(window.location.origin);
    }
  }, []);

  const logoutRef = useRef(logout);

  // Sync refs with the latest state/functions on every render
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
    const handleServerMessage = (event: MessageEvent) => {
      console.log('AUTH: postMessage event received');
      console.log('AUTH: Origin:', event.origin);
      
      // Robustly parse the incoming message data
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        console.log('AUTH: Parsed data:', data);
      } catch (e) {
        // Not a JSON message or already an object, handle gracefully
        data = event.data;
        console.log('AUTH: Data (not JSON):', data);
      }

      if (!data || typeof data !== 'object') {
        console.log('AUTH: Data is not a valid object, ignoring.');
        return;
      }

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).trim() : '';

      console.log('AUTH: Detected status:', status);
      console.log('AUTH: Detected purpose:', purpose);

      // Check for remote logoff request
      if (status === 'logoff') {
        console.log('AUTH: Logoff status detected. Triggering logout...');
        logoutRef.current();
        return;
      }

      // Handle successful authentication
      if (
        status === 'success' &&
        purpose === 'Authenticated' &&
        !handshakeCompletedRef.current
      ) {
        console.log('AUTH: Authentication success detected.');
        handshakeCompletedRef.current = true;
        try {
          setUserRef.current(data);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
          console.error('AUTH: Failed to save session to localStorage:', error);
        }
      } else if (status === 'fail') {
        console.log('AUTH: Authentication failure detected.');
        const description = data.purpose || 'An unknown error occurred on the server.';

        toastRef.current({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: description,
        });

        // If verification code failed, allow the user to try again or go back
        if (purpose.includes('Verify') || purpose.includes('Verification')) {
          // No auto-redirect here to allow user to read the error
        }
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => window.removeEventListener('message', handleServerMessage);
  }, []);

  // Initial session restoration
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
