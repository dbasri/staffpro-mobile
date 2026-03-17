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
 * Normalizes standard Base64 to URL-safe Base64URL.
 */
function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return str;
  // Handle PHP/Server binary wrapping (=?BINARY?B?...?=)
  let cleanStr = str.replace(/^=\?BINARY\?B\?/, '').replace(/\?=$/, '').trim();
  // Swap standard Base64 chars for URL-safe ones and remove padding
  return cleanStr.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Recursively normalizes binary fields in WebAuthn options objects.
 * This is critical for nested fields like allowCredentials[].id
 */
function prepareWebAuthnOptions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(prepareWebAuthnOptions);

  const normalized: any = {};
  for (const key in obj) {
    const val = obj[key];
    // Fields that are typically base64 encoded binaries needing URL-safe normalization
    if (['challenge', 'id'].includes(key) && typeof val === 'string') {
      normalized[key] = normalizeBase64URL(val);
    } else {
      normalized[key] = prepareWebAuthnOptions(val);
    }
  }
  return normalized;
}

function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS Device';
  if (/Android/.test(ua)) return 'Android Device';
  return 'Mobile Browser';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const isAuthenticated = !!user;

  const login = useCallback((sessionData: UserSession) => {
    console.log('DIAGNOSTIC: [AuthProvider] Finalizing login for:', sessionData.email);
    setUser(sessionData);
    setAuthError(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('DIAGNOSTIC ERROR: Failed to save session to storage');
    }
  }, []);

  const logout = useCallback(() => {
    console.log('DIAGNOSTIC: [AuthProvider] Logging out');
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {}
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
      
      if (status === 'success' && (purpose === 'authenticated' || (purpose.includes('verify') && !purpose.includes('email')))) {
        console.log('DIAGNOSTIC: [AuthProvider] Success message received from WebView');
        const email = data.email || localStorage.getItem(EMAIL_STORAGE_KEY) || '';
        loginRef.current({ ...data, email, method: 'code' });
      } else if (status === 'fail') {
        setAuthError('invalid-code');
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
    setAuthError(null);
    const deviceName = getDeviceName();
    
    console.log('DIAGNOSTIC: [AuthProvider] Initiating passkey flow...');
    
    try {
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      
      // The server might wrap options in a publicKey property
      const rawOptions = responseData.publicKey || responseData;
      const options = prepareWebAuthnOptions(rawOptions);
      
      console.log('DIAGNOSTIC: [AuthProvider] Normalized Options:', JSON.stringify(options, null, 2));
      
      // Determine if this is registration (new device) or authentication (known device)
      const isRegistration = !!(options.user && options.user.id);
      
      console.log('DIAGNOSTIC: [AuthProvider] Calling browser WebAuthn library:', isRegistration ? 'startRegistration' : 'startAuthentication');
      
      let credentialResponse;
      if (isRegistration) {
        // simplewebauthn v13+ prefers { optionsJSON: ... } wrapper
        credentialResponse = await startRegistration({ optionsJSON: options });
      } else {
        credentialResponse = await startAuthentication({ optionsJSON: options });
      }
      
      console.log('DIAGNOSTIC: [AuthProvider] Credential signature obtained. Verifying with server...');
      const result = await AuthApi.verifyPasskey(credentialResponse, email, deviceName);
      
      if (result.status === 'success') {
        console.log('DIAGNOSTIC: [AuthProvider] Login successful');
        login({ ...result, email: result.email || email, method: 'passkey' } as UserSession);
        router.replace('/');
      } else {
        throw new Error(result.purpose || 'Server verification failed.');
      }
    } catch (error: any) {
      console.error('DIAGNOSTIC ERROR: [AuthProvider] Authentication Error:', error);
      setAuthError('auth-failed');
      toast({
        title: 'Sign In Error',
        description: error.message || 'Passkey process was interrupted.',
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
