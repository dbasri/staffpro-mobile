'use client';

import {
  useState,
  useEffect,
  createContext,
  type ReactNode,
  useCallback,
} from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const session = localStorage.getItem('staffpro-session');
      if (session) {
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Could not access local storage:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async () => {
    try {
      localStorage.setItem('staffpro-session', 'true');
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Could not access local storage:', error);
    }
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem('staffpro-session');
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Could not access local storage:', error);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
