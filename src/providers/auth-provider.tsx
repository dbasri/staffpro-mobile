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

  // Use a ref to allow the stable listener to call the latest setUser function
  const setUserRef = useRef(setUser);
  useEffect(() => {
    setUserRef.current = setUser;
  });

  const login = useCallback(
    (sessionData: UserSession) => {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
        setUser(sessionData);
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

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error)      {
      console.error('Could not access local storage to remove session:', error);
    }
    setUser(null);
    window.location.assign('/login');
  }, []);

  useEffect(() => {
    console.log('--- AUTH PROVIDER: ADDING STABLE GLOBAL LISTENER ---');

    const handleServerMessage = (event: MessageEvent) => {
      const expectedOrigin = 'https://mystaffpro.com';
      // Use a wildcard '*' for the expectedOrigin for local development if needed,
      // but the specific origin is required for production security.
      if (expectedOrigin !== '*' && event.origin !== expectedOrigin) {
        return;
      }
      
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error('--- AUTH PROVIDER: FAILED TO PARSE JSON ---', event.data);
        return;
      }

      if (data.status === 'success' && data.purpose === 'Authenticated' && data.session) {
        console.log('--- AUTH PROVIDER: AUTHENTICATED message received. Updating session state...');
        try {
          // Use the ref to call the latest setUser, triggering a graceful re-render
          setUserRef.current(data);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
          console.error(
            'Could not access local storage to save session:',
            error
          );
          alert('Login Error: Could not save session to device.');
        }
      } else if (data.status === 'success' && data.purpose === 'Send verify code email') {
        console.log('--- AUTH PROVIDER: "Email sent" confirmation received. No action needed.');
        // This is expected. We just wait for the user to enter the code.
      } else if (data.status === 'fail') {
        console.log('--- AUTH PROVIDER: FAIL message received. Alerting user...');
        alert(
          `Authentication Failed: ${
            data.purpose || 'An unknown error occurred on the server.'
          }`
        );
      } else {
        // This can be noisy if other scripts use postMessage. Use console.debug if needed.
        // console.warn('--- AUTH PROVIDER: Unknown message format or purpose received. IGNORING.', data);
      }
    };

    window.addEventListener('message', handleServerMessage);

    return () => {
      console.log('--- AUTH PROVIDER: REMOVING STABLE GLOBAL LISTENER ---');
      window.removeEventListener('message', handleServerMessage);
    };
  }, []); // Empty dependency array ensures this runs only ONCE.

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        if (session.status === 'success' && session.purpose === 'Authenticated') {
          setUser(session);
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
