'use client';

import {
  useState,
  useEffect,
  createContext,
  type ReactNode,
  useCallback,
} from 'react';
import type { UserSession } from '@/types/session';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { AuthApi } from '@/lib/auth-api';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

// Polyfill check for ReferenceError: _async_to_generator occurring in some environments
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
 * Handles the pattern "=?BINARY?B?...base64_data...?=" used by the server.
 * Surgically handles double-encoding where the marker contains a second Base64 string.
 */
function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return str;
  
  let content = str;
  if (str.startsWith('=?BINARY?B?')) {
    content = str.replace(/^=\?BINARY\?B\?/, '').replace(/\?=$/, '').trim();
  }

  // Ensure content is a valid Base64 string for atob (fix padding)
  const standardB64 = content.replace(/-/g, '+').replace(/_/g, '/');
  const paddedB64 = standardB64.padEnd(standardB64.length + (4 - (standardB64.length % 4)) % 4, '=');
  
  try {
    const decoded = atob(paddedB64);
    // Case 1: Double-encoded. The 'decoded' result is already a 43-char Base64URL string (e.g. q8EQ...)
    if (/^[A-Za-z0-9\-_]{10,}$/.test(decoded)) {
      console.log('DIAGNOSTIC: [normalize] Double-encoding detected. Returning nested string.');
      return decoded;
    }
    
    // Case 2: Standard single encoding. The 'decoded' result is raw binary bytes.
    // Convert raw bytes to a clean Base64URL string for the browser.
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  } catch (e) {
    // Fallback: Just return the content stripped of URL-unsafe characters
    return content.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
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
 * Improved device name extraction from User Agent.
 */
function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown Device';
  const ua = window.navigator.userAgent;
  
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    const match = ua.match(/Android\s+([^\s;]+);\s+([^\s;)]+)/);
    if (match) return `${match[2]} (Android ${match[1]})`;
    return 'Android Device';
  }
  if (/Windows NT/.test(ua)) return 'Windows PC';
  if (/Macintosh/.test(ua)) return 'Mac';
  
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
        login({ ...data, email });
      } else if (data.status === 'fail' || data.purpose === 'logoff') {
        logout();
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => window.removeEventListener('message', handleServerMessage);
  }, [login, logout]);

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
    console.log(`DIAGNOSTIC: [AuthProvider] Device Name identified as: ${deviceName}`);
    
    try {
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      
      // Surgical extraction: Ensure we get the publicKey object regardless of noise
      const rawOptions = responseData.publicKey || responseData;
      const options = prepareWebAuthnOptions(rawOptions);
      
      console.log('DIAGNOSTIC: [AuthProvider] Normalized Options for Browser:', JSON.stringify(options, null, 2));

      // Identification: If 'user.id' exists, it is a Registration flow.
      const isRegistration = !!(options.user && options.user.id);
      
      let credentialResponse;
      if (isRegistration) {
        console.log('DIAGNOSTIC: [AuthProvider] Calling startRegistration...');
        credentialResponse = await startRegistration({ optionsJSON: options });
      } else {
        console.log('DIAGNOSTIC: [AuthProvider] Calling startAuthentication...');
        credentialResponse = await startAuthentication({ optionsJSON: options });
      }
      
      console.log('DIAGNOSTIC: [AuthProvider] Credential Response:', JSON.stringify(credentialResponse, null, 2));
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
