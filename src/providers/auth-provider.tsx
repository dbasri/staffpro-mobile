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
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const isAuthenticated = !!user;

  // Load user from localStorage on initial load
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

  const login = useCallback((sessionData: UserSession) => {
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
  }, [toast]);

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

  // This is the stable message listener. It's added only once.
  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      // IMPORTANT: Always verify the origin of the message for security
      if (event.origin !== 'https://mystaffpro.com') {
        return;
      }

      let data;
      try {
        if (typeof event.data === 'string') {
          data = JSON.parse(event.data);
        } else {
          return; // Ignore non-string messages
        }
      } catch (e) {
        return; // Ignore non-JSON messages
      }
      
      if (data.status === 'success' && data.session) {
        login(data as UserSession);
      } else if (data.status === 'fail') {
        toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: data.purpose || 'An unknown error occurred on the server.',
        });
        // On failure, ensure we are fully logged out and redirect to the login page
        logout();
      }
    };

    window.addEventListener('message', handleServerMessage);

    // Cleanup function to remove the listener when the provider unmounts
    return () => {
      window.removeEventListener('message', handleServerMessage);
    };
  }, [login, logout, toast]);


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
