'use client';

import {
  useState,
  useEffect,
  createContext,
  type ReactNode,
  useCallback,
} from 'react';
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

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem('staffpro-session');
      if (sessionString) {
        const session = JSON.parse(sessionString);
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
      console.error('Could not access local storage to save session:', error);
    }
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem('staffpro-session');
      setUser(null);
    } catch (error) {
      console.error('Could not access local storage to remove session:', error);
    }
  }, []);

  const passkeyLogin = useCallback(async () => {
    // This is a mock implementation for passkey login.
    // In a real application, you would integrate with a WebAuthn library.
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
