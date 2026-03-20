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
 * USER RESTORED: Working normalization function.
 * Surgically extracts the Base64 content from PHP binary markers and handles double-encoding.
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
 * Extracts specific hardware model or OS version from User Agent.
 */
function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown Device';
  const ua = window.navigator.userAgent;
  
  if (/iPhone|iPad/.test(ua)) return 'Apple Device';
  
  if (/Android/.test(ua)) {
    const match = ua.match(/Android\s+([0-9.]+);\s+([^;)]+)/);
    if (match) {
      const version = match[1];
      let model = match[2].split('Build/')[0].trim();
      if (model.length < 2 || /^(Mobile|wv|K|Android)$/i.test(model)) {
        return `Android ${version} Device`;
      }
      return model;
    }
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

      // Handle case-insensitive "Authenticated" or "authenticated"
      const isSuccess = data.status === 'success' || data.Status === 'success';
      const isAuthPurpose = data.purpose?.toLowerCase() === 'authenticated';

      if (isSuccess && isAuthPurpose) {
        const email = data.email || localStorage.getItem(EMAIL_STORAGE_KEY) || '';
        // Ensure session exists even if server skips it
        const session = data.session || 'passkey-session';
        login({ ...data, email, session });
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
    
    try {
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      const rawOptions = responseData.publicKey || responseData;
      const options = prepareWebAuthnOptions(rawOptions);
      
      const isRegistration = !!(options.user && options.user.id);
      
      let credentialResponse;
      if (isRegistration) {
        credentialResponse = await startRegistration({ optionsJSON: options });
      } else {
        credentialResponse = await startAuthentication({ optionsJSON: options });
      }
      
      const result = await AuthApi.verifyPasskey(credentialResponse, email, deviceName);
      
      if (result.status === 'success') {
        // Log explicitly to help debug missing session IDs
        console.log('PASSKEY LOGIN SUCCESS:', result);
        
        login({ 
          ...result, 
          email: result.email || email, 
          session: result.session || 'passkey-session', // Fallback for partial server responses
          method: 'passkey' 
        } as UserSession);
        
        router.replace('/');
      } else {
        throw new Error(result.purpose || 'Verification failed');
      }
    } catch (error: any) {
      console.error('DIAGNOSTIC ERROR: [AuthProvider] Passkey Flow Error:', error);
      setAuthError(error.message || 'auth-failed');
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
