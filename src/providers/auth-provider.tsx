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
const EMAIL_STORAGE_KEY = 'staffpro-verification-email';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const isAuthenticated = !!user;

  // Use refs to allow the stable listener to call the latest functions
  const setUserRef = useRef(setUser);
  const toastRef = useRef(toast);
  useEffect(() => {
    setUserRef.current = setUser;
    toastRef.current = toast;
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
      localStorage.removeItem(EMAIL_STORAGE_KEY);
    } catch (error) {
      console.error('Could not access local storage to clear session:', error);
    }
    setUser(null);
    window.location.assign('/login');
  }, []);

  useEffect(() => {
    console.log('--- AUTH PROVIDER: ADDING STABLE GLOBAL LISTENER ---');

    const handleServerMessage = (event: MessageEvent) => {
      // IMPORTANT: For production, you must use a specific origin.
      // Using '*' is a temporary diagnostic step.
      // if (event.origin !== 'https://mystaffpro.com') {
      //     console.log('--- AUTH PROVIDER: Origin MISMATCH ---', 'Expected: https://mystaffpro.com', 'Received:', event.origin);
      //     return;
      // }

      console.log('--- AUTH PROVIDER: Raw message data received:', event.data);

      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error(
          '--- AUTH PROVIDER: FAILED TO PARSE JSON ---',
          event.data
        );
        return;
      }

      console.log('--- AUTH PROVIDER: Parsed message data:', data);
      const purpose = data.purpose ? data.purpose.trim() : '';

      if (data.status === 'success' && purpose === 'Authenticated') {
        console.log(
          '--- AUTH PROVIDER: AUTHENTICATED message received. Updating session state...'
        );
        try {
          setUserRef.current(data);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
          console.error(
            'Could not access local storage to save session:',
            error
          );
          toastRef.current({
            variant: 'destructive',
            title: 'Login Error',
            description: 'Could not save session to device.',
          });
        }
      } else if (
        data.status === 'success' &&
        purpose === 'Send verify code email'
      ) {
        console.log(
          '--- AUTH PROVIDER: "Email sent" confirmation received. No action needed.'
        );
        // This is expected. We just wait for the user to enter the code.
      } else if (data.status === 'fail') {
        console.log(
          '--- AUTH PROVIDER: FAIL message received. Alerting user...'
        );

        const description =
          data.purpose || 'An unknown error occurred on the server.';

        toastRef.current({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: description,
        });

        // If verification code failed, redirect to login as codes are single-use
        if (purpose.includes('Verify') || purpose.includes('Verification')) {
          // Use a timeout to allow the user to read the toast message before redirecting
          setTimeout(() => {
            window.location.assign('/login');
          }, 3000); // 3-second delay
        }
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
        if (
          session.status === 'success' &&
          session.purpose === 'Authenticated'
        ) {
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
