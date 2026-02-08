'use client';

import {
  useState,
  useEffect,
  createContext,
  type ReactNode,
  useCallback,
} from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { UserSession } from '@/types/session';

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (sessionData: UserSession) => void;
  passkeyLogin: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = !!user;
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem('staffpro-session');
      if (sessionString) {
        const session = JSON.parse(sessionString);
        // We only restore the session if it was a successful one
        if (session.status === 'success') {
          setUser(session);
        }
      }
    } catch (error) {
      console.error('Could not access local storage or parse session:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((sessionData: UserSession) => {
    try {
      localStorage.setItem('staffpro-session', JSON.stringify(sessionData));
      setUser(sessionData);
    } catch (error) {
      console.error('Could not access local storage:', error);
    }
  }, []);

  const passkeyLogin = useCallback(async () => {
    // This is a mock login for passkey.
    // In a real scenario it would be more complex.
    const mockSession: UserSession = {
      status: 'success',
      email: 'passkey-user@example.com',
      name: 'Passkey User',
      session: 'mock-session-id-passkey',
      purpose: 'Passkey login successful',
    };
    try {
      localStorage.setItem('staffpro-session', JSON.stringify(mockSession));
      setUser(mockSession);
    } catch (error) {
      console.error('Could not access local storage:', error);
    }
  }, []);


  const logout = useCallback(() => {
    try {
      localStorage.removeItem('staffpro-session');
      setUser(null);
    } catch (error) {
      console.error('Could not access local storage:', error);
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('--- AUTH PROVIDER MESSAGE LISTENER ---');
      console.log('Auth provider listener received origin:', event.origin);
      console.log('Auth provider listener received data:', event.data);

      // SECURITY: Only accept messages from our trusted server origin.
      if (event.origin !== 'https://mystaffpro.com') {
        console.warn(
          `Message from untrusted origin ignored: ${event.origin}. Expected 'https://mystaffpro.com'.`
        );
        return;
      }

      if (
        event.data &&
        typeof event.data === 'object' &&
        'status' in event.data
      ) {
        const serverData = event.data as UserSession;
        console.log('Server data parsed:', serverData);

        if (serverData.status === 'success') {
          console.log(
            'Authentication SUCCESS. Storing session and redirecting.'
          );
          login(serverData);
          router.replace('/');
        } else if (serverData.status === 'fail') {
          console.error('Authentication FAIL. Reason:', serverData.purpose);
          toast({
            variant: 'destructive',
            title: 'Authentication Failed',
            description:
              serverData.purpose || 'An unknown error occurred on the server.',
          });
          setTimeout(() => {
            logout();
            router.replace('/login');
          }, 3000);
        }
      } else {
        console.log(
          'Received message, but data format is not recognized:',
          event.data
        );
      }
    };

    console.log('--- Adding AUTH PROVIDER message event listener. ---');
    window.addEventListener('message', handleMessage);

    return () => {
      console.log('--- REMOVING AUTH PROVIDER message event listener. ---');
      window.removeEventListener('message', handleMessage);
    };
  }, [login, logout, router, toast]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, isLoading, login, passkeyLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
