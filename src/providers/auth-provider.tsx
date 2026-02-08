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

  // Use a ref to hold the latest versions of callbacks, preventing stale closures.
  const callbacks = useRef({
    login: (sessionData: UserSession) => {},
    logout: () => {},
    toast: (options: any) => {},
  });

  const login = useCallback(
    (sessionData: UserSession) => {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
        setUser(sessionData);
        // A full page reload is the most robust way to ensure a clean state
        window.location.assign('/');
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
    } catch (error) {
      console.error('Could not access local storage to remove session:', error);
    }
    setUser(null);
    // A full page reload ensures a clean state and redirects to login
    window.location.assign('/login');
  }, []);

  // Keep the ref updated with the latest callbacks.
  useEffect(() => {
    callbacks.current = { login, logout, toast };
  }, [login, logout, toast]);

  // Load user from localStorage on initial load.
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
      console.error('Could not access local storage or parse session:', error);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // This is the stable message listener. It's added only once.
  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      console.log('--- AUTH PROVIDER: MESSAGE RECEIVED ---');
      // IMPORTANT: Always verify the origin of the message for security
      if (event.origin !== 'https://mystaffpro.com') {
        console.log(
          `--- AUTH PROVIDER: Message from wrong origin: ${event.origin}. Expected https://mystaffpro.com ---`
        );
        return;
      }
      console.log('--- AUTH PROVIDER: Origin OK ---');

      let data;
      if (typeof event.data !== 'string') {
        console.log(
          '--- AUTH PROVIDER: Message data is not a string. Ignoring. ---',
          event.data
        );
        return;
      }
      console.log('--- AUTH PROVIDER: Data is a string. Raw data:', event.data);

      try {
        data = JSON.parse(event.data);
        console.log('--- AUTH PROVIDER: JSON parsed successfully ---', data);
      } catch (e) {
        console.log('--- AUTH PROVIDER: Failed to parse JSON. Error:', e);
        return;
      }

      if (data.status === 'success' && data.session) {
        console.log(
          '--- AUTH PROVIDER: Success status found. Logging in... ---'
        );
        callbacks.current.login(data as UserSession);
      } else if (data.status === 'fail') {
        console.log(
          '--- AUTH PROVIDER: Fail status found. Showing toast... ---'
        );
        callbacks.current.toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description:
            data.purpose || 'An unknown error occurred on the server.',
        });
        // On failure, ensure we are fully logged out and redirect to the login page
        callbacks.current.logout();
      } else {
        console.log(
          '--- AUTH PROVIDER: Message data did not contain expected status. ---',
          data
        );
      }
    };

    console.log('--- AUTH PROVIDER: ADDING MESSAGE LISTENER (ONCE) ---');
    window.addEventListener('message', handleServerMessage);

    // Cleanup function to remove the listener when the provider unmounts
    return () => {
      console.log('--- AUTH PROVIDER: REMOVING MESSAGE LISTENER ---');
      window.removeEventListener('message', handleServerMessage);
    };
  }, []); // <-- Empty dependency array guarantees this runs only once.

  const passkeyLogin = useCallback(async () => {
    const mockSession: UserSession = {
      status: 'success',
      email: 'passkey-user@example.com',
      name: 'Passkey User',
      session: 'mock-session-id-passkey',
      purpose: 'Passkey login successful',
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
