
'use client';

import {
  useState,
  useEffect,
  createContext,
  type ReactNode,
  useCallback,
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

  // This function is for manual logins if needed, but the primary logic is in the effect.
  const login = useCallback(
    (sessionData: UserSession) => {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
        setUser(sessionData);
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
    window.location.assign('/login');
  }, []);

  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      console.log('--- WIDE-OPEN LISTENER: Message received ---');
      console.log('--- Origin:', event.origin);
      try {
        const dataPreview =
          typeof event.data === 'string'
            ? event.data.substring(0, 200) + '...'
            : JSON.stringify(event.data);
        console.log('--- Data Preview:', dataPreview);
      } catch {
        console.log('--- Could not preview data.');
      }

      const expectedOrigin = 'https://mystaffpro.com';
      if (event.origin !== expectedOrigin) {
        // Silently ignore messages from other origins.
        return;
      }

      console.log('--- AUTH PROVIDER: Origin matched. Processing message...');

      let data;
      try {
        data = JSON.parse(event.data);
        console.log('--- AUTH PROVIDER: Parsed data:', data);
      } catch (e) {
        console.log('--- AUTH PROVIDER: FAILED TO PARSE JSON. IGNORING.', e);
        return;
      }

      if (data.status === 'success' && data.session) {
        console.log(
          '--- AUTH PROVIDER: SUCCESS message received. Logging in directly...'
        );
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
          // Force a full page reload to ensure a clean state
          window.location.assign('/');
        } catch (error) {
          console.error(
            'Could not access local storage to save session:',
            error
          );
          // We can't use the toast hook here directly, but we can alert the user.
          alert('Login Error: Could not save session to device.');
        }
      } else if (data.status === 'fail') {
        console.log('--- AUTH PROVIDER: FAIL message received. Toasting...');
        // We can't use the toast hook directly, but we can show an alert.
        alert(
          `Authentication Failed: ${
            data.purpose || 'An unknown error occurred on the server.'
          }`
        );
      } else {
        console.log('--- AUTH PROVIDER: Unknown message format. IGNORING.');
      }
    };

    console.log('--- AUTH PROVIDER: ADDING STABLE GLOBAL LISTENER ---');
    window.addEventListener('message', handleServerMessage);

    // The empty dependency array [] GUARANTEES this effect runs only ONCE.
    // The listener will only be removed if the AuthProvider itself is ever unmounted.
    return () => {
      console.log('--- AUTH PROVIDER: REMOVING STABLE GLOBAL LISTENER ---');
      window.removeEventListener('message', handleServerMessage);
    };
  }, []);

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
