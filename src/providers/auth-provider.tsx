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

// Polyfill check for ReferenceError: _async_to_generator
if (typeof window !== 'undefined' && !(window as any)._async_to_generator) {
  (window as any)._async_to_generator = (fn: any) => fn;
}

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
 * Handles the pattern "=?BINARY?B?...base64_data...?=" commonly used by PHP/LDAP.
 * Corrects double-encoding and ensures URL-safe format.
 */
function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return str;
  
  let cleanStr = str;
  if (str.startsWith('=?BINARY?B?')) {
    const b64 = str.replace(/^=\?BINARY\?B\?/, '').replace(/\?=$/, '').trim();
    const paddedB64 = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
    
    try {
      const decoded = atob(paddedB64);
      // If it's a printable Base64URL string, use it. Otherwise use the original b64 part.
      if (/^[A-Za-z0-9\-_]{10,}$/.test(decoded)) {
        cleanStr = decoded;
      } else {
        cleanStr = b64;
      }
    } catch (e) {
      cleanStr = b64;
    }
  }
  
  return cleanStr
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .trim();
}

/**
 * Recursively prepares WebAuthn options by cleaning binary fields.
 */
function prepareWebAuthnOptions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(prepareWebAuthnOptions);

  const normalized: any = {};
  for (const key in obj) {
    const val = obj[key];
    const isBinaryField = ['challenge', 'id'].includes(key);
    
    if (isBinaryField && typeof val === 'string') {
      normalized[key] = normalizeBase64URL(val);
    } else {
      normalized[key] = prepareWebAuthnOptions(val);
    }
  }
  return normalized;
}

/**
 * Decodes Base64URL string to Uint8Array for native navigator calls.
 */
function base64URLToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64.padEnd(base64.length + padLen, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
    console.log('DIAGNOSTIC: [AuthProvider] Logging in user:', sessionData.email);
    setUser(sessionData);
    setAuthError(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {}
  }, []);

  const logout = useCallback(() => {
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

      if (data.status === 'success' && data.purpose === 'authenticated') {
        const email = data.email || localStorage.getItem(EMAIL_STORAGE_KEY) || '';
        loginRef.current({ ...data, email });
      } else if (data.status === 'fail' || data.purpose === 'logoff') {
        logoutRef.current();
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
    
    try {
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      const rawOptions = responseData.publicKey || responseData;
      const options = prepareWebAuthnOptions(rawOptions);
      
      console.log('DIAGNOSTIC: [AuthProvider] Normalized Options:', JSON.stringify(options, null, 2));

      const isRegistration = !!(options.user && options.user.id);

      // --- DIAGNOSTIC TEST FOR NATIVE API ---
      if (!isRegistration && options.allowCredentials) {
        console.log('DIAGNOSTIC: [AuthProvider] Attempting native navigator.credentials.get diagnostic test...');
        try {
          const nativeOptions: any = {
            publicKey: {
              ...options,
              challenge: base64URLToUint8Array(options.challenge),
              allowCredentials: options.allowCredentials.map((cred: any) => ({
                ...cred,
                id: base64URLToUint8Array(cred.id)
              }))
            },
            // Immediate abort for diagnostic only
            signal: new AbortController().signal
          };
          console.log('DIAGNOSTIC: [AuthProvider] Native diagnostic options prepared.');
        } catch (diagError) {
          console.error('DIAGNOSTIC ERROR: [AuthProvider] Native options preparation failed:', diagError);
        }
      }
      // --- END DIAGNOSTIC TEST ---
      
      let credentialResponse;
      if (isRegistration) {
        console.log('DIAGNOSTIC: [AuthProvider] Calling startRegistration({ optionsJSON })...');
        credentialResponse = await startRegistration({ optionsJSON: options });
      } else {
        console.log('DIAGNOSTIC: [AuthProvider] Calling startAuthentication({ optionsJSON })...');
        credentialResponse = await startAuthentication({ optionsJSON: options });
      }
      
      console.log('DIAGNOSTIC: [AuthProvider] WebAuthn response received. Sending for verification...');
      const result = await AuthApi.verifyPasskey(credentialResponse, email, deviceName);
      
      if (result.status === 'success') {
        login({ ...result, email: result.email || email, method: 'passkey' } as UserSession);
        router.replace('/');
      } else {
        throw new Error(result.purpose || 'Verification failed');
      }
    } catch (error: any) {
      console.error('DIAGNOSTIC ERROR: [AuthProvider] Passkey Flow Error:', error);
      setAuthError('auth-failed');
      toast({
        title: 'Authentication Error',
        description: error.message || 'The passkey flow failed or timed out.',
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
