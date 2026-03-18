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
 * Surgically handles the server's binary markers and double-encoded Base64.
 * Resilient against 'atob' encoding errors by converting to standard Base64 first.
 */
function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return str;
  
  let content = str.trim();
  // 1. Unwrap PHP binary markers if present
  if (content.startsWith('=?BINARY?B?')) {
    content = content.replace(/^=\?BINARY\?B?/, '').replace(/\?=$/, '').trim();
  }

  // 2. Resolve potential double-encoding
  // If the content is suspiciously long (> 48 chars), it might be an inner Base64 string.
  if (content.length > 48) {
    try {
      // 'atob' expects standard Base64 (+ /), not Base64URL (- _)
      const standardBase64 = content.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(standardBase64);
      // If the result looks like a valid credential ID (usually 43-44 chars), we use it.
      if (decoded.length >= 32 && decoded.length <= 128) {
        content = decoded;
      }
    } catch (e) {
      // If atob fails (invalid chars or padding), we fallback to the original content.
      console.warn('DIAGNOSTIC: normalizeBase64URL encountered invalid Base64 for atob, falling back.');
    }
  }

  // 3. Final conversion to URL-safe Base64 (RFC 4648) required by WebAuthn
  return content
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Prepares WebAuthn options by normalizing binary-like fields recursively.
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
 * Specifically avoids generic 'K' identifiers on Android.
 */
function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown Device';
  const ua = window.navigator.userAgent;
  
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    // Attempt to extract the hardware model (e.g., Pixel 8, SM-G991B)
    const modelMatch = ua.match(/Android\s+[^;]+;\s+([^;)]+)/);
    if (modelMatch && modelMatch[1]) {
      const model = modelMatch[1].trim();
      // Filter out generic keywords often found in truncated UAs
      if (model.length > 1 && !/^(K|Build|Mobile|Version|Chrome|Safari)$/i.test(model)) {
        return model;
      }
    }
    // Brand search fallbacks
    if (/Samsung|SM-|GT-/i.test(ua)) return 'Samsung Device';
    if (/Pixel/i.test(ua)) return 'Google Pixel';
    if (/Huawei|HMA-|LYA-/i.test(ua)) return 'Huawei Device';
    
    const osMatch = ua.match(/Android\s+([0-9.]+)/);
    return osMatch ? `Android ${osMatch[1]} Device` : 'Android Device';
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
    console.log(`DIAGNOSTIC: [AuthProvider] Device identified as: ${deviceName}`);
    
    try {
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      const rawOptions = responseData.publicKey || responseData;
      
      // Preparation step with recursive normalization of binary fields
      const options = prepareWebAuthnOptions(rawOptions);
      
      console.log('DIAGNOSTIC: [AuthProvider] Options for Browser:', JSON.stringify(options, null, 2));

      // Identification: If 'user.id' exists, it is a Registration flow.
      const isRegistration = !!(options.user && options.user.id);
      
      let credentialResponse;
      if (isRegistration) {
        console.log('DIAGNOSTIC: [AuthProvider] Starting Registration...');
        credentialResponse = await startRegistration({ optionsJSON: options });
      } else {
        console.log('DIAGNOSTIC: [AuthProvider] Starting Authentication...');
        credentialResponse = await startAuthentication({ optionsJSON: options });
      }
      
      console.log('DIAGNOSTIC: [AuthProvider] Credential Response received. Verifying with server...');
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
