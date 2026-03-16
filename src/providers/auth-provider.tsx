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
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { AuthApi } from '@/lib/auth-api';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  login: (sessionData: UserSession) => void;
  passkeyLogin: (email: string) => Promise<void>;
  logout: () => void;
  setAuthError: (error: string | null) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_STORAGE_KEY = 'staffpro-session';
const EMAIL_STORAGE_KEY = 'staffpro-verification-email';

/**
 * Converts standard Base64 (including PHP binary markers) to URL-safe Base64URL.
 */
function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return str;
  // Strip PHP binary markers: =?BINARY?B?...=?=
  let cleanStr = str.replace(/^=\?BINARY\?B\?/, '').replace(/\?=$/, '').trim();
  
  // Standard Base64 to URL-safe Base64URL
  return cleanStr
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Deep-walks an options object and normalizes challenge/id fields for simplewebauthn.
 */
function prepareWebAuthnOptions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(prepareWebAuthnOptions);
  }

  const normalized: any = {};
  for (const key in obj) {
    const val = obj[key];
    if (key === 'challenge' || key === 'id') {
      normalized[key] = typeof val === 'string' ? normalizeBase64URL(val) : val;
    } else if (typeof val === 'object' && val !== null) {
      normalized[key] = prepareWebAuthnOptions(val);
    } else {
      normalized[key] = val;
    }
  }
  return normalized;
}

function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS Device';
  if (/Android/.test(ua)) return 'Android Device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Mobile/Web Browser';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const isAuthenticated = !!user;

  const login = useCallback((sessionData: UserSession) => {
    setUser(sessionData);
    setAuthError(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('AUTH: Failed to persist session.');
    }
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('AUTH: Error clearing storage:', error);
    }
    setUser(null);
    setAuthError(null);
    router.replace('/login');
  }, [router]);

  const logoutRef = useRef(logout);
  const loginRef = useRef(login);

  useEffect(() => {
    logoutRef.current = logout;
    loginRef.current = login;
  }, [logout, login]);

  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      let data = event.data;
      if (typeof data === 'string') {
        try {
          const jsonMatch = data.match(/\{.*\}/);
          if (jsonMatch) data = JSON.parse(jsonMatch[0]);
          else return;
        } catch (e) { return; }
      }
      if (!data || typeof data !== 'object') return;

      const status = data.status ? String(data.status).toLowerCase() : '';
      const purpose = data.purpose ? String(data.purpose).toLowerCase() : '';

      if (status === 'logoff' || purpose === 'logoff') {
        logoutRef.current();
        return;
      }
      
      if (status === 'fail' || (status === 'success' && (purpose.includes('invalid') || purpose.includes('error')))) {
        setAuthError('invalid-code');
        return;
      }

      if (status === 'success') {
        const isActuallyAuthenticated = purpose === 'authenticated' || (purpose.includes('verify') && !purpose.includes('email'));
        if (isActuallyAuthenticated) {
          const email = data.email || localStorage.getItem(EMAIL_STORAGE_KEY) || '';
          loginRef.current({ ...data, email, method: 'code' });
        }
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => window.removeEventListener('message', handleServerMessage);
  }, []);

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        if (session.status === 'success') setUser(session);
      }
    } catch (error) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const passkeyLogin = useCallback(async (email: string) => {
    try {
      setAuthError(null);
      const deviceName = getDeviceName();
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      
      const rawOptions = responseData.publicKey || responseData;
      const options = prepareWebAuthnOptions(rawOptions);
      
      if (!options || !options.challenge) {
        throw new Error('Server response missing WebAuthn challenge.');
      }

      let credentialResponse;
      const isRegistration = !!(options.user && options.user.id);
      
      if (isRegistration) {
        credentialResponse = await startRegistration(options);
      } else {
        credentialResponse = await startAuthentication(options);
      }
      
      const result = await AuthApi.verifyPasskey(credentialResponse, email, deviceName);
      
      if (result.status === 'success') {
        const sessionData = { ...result, email: result.email || email, method: 'passkey' };
        login(sessionData as UserSession);
        router.replace('/');
      } else {
        throw new Error(result.purpose || 'Passkey verification failed.');
      }
    } catch (error: any) {
      console.error('PASSKEY: Error details:', error);
      let errorMessage = error.message || 'Could not sign in with passkey.';
      
      if (error.name === 'SecurityError') {
        errorMessage = 'Domain mismatch: The rpId from server must match or be a suffix of ' + window.location.hostname;
      } else if (error.name === 'NotAllowedError') {
        errorMessage = 'Authentication timed out or was cancelled.';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Operation aborted by browser.';
      }

      setAuthError('auth-failed');
      toast({
        title: 'Authentication Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [login, toast, router]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, isLoading, authError, login, passkeyLogin, logout, setAuthError }}
    >
      {children}
    </AuthContext.Provider>
  );
}
