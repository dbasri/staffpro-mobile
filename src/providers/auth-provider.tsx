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
 * Surgically converts standard Base64 (with optional PHP markers) to URL-safe Base64URL.
 */
function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return str;
  
  // Strip PHP binary markers if present
  let cleanStr = str.replace(/^=\?BINARY\?B\?/, '').replace(/\?=$/, '').trim();
  
  // Standard Base64 to URL-safe Base64URL (no padding)
  return cleanStr
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Deeply normalizes WebAuthn options to ensure challenge and binary IDs are clean Base64URL strings.
 */
function prepareWebAuthnOptions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(prepareWebAuthnOptions);
  }

  const normalized: any = {};
  for (const key in obj) {
    const val = obj[key];
    // Normalize specific binary-safe keys
    if (['challenge', 'id'].includes(key)) {
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
      
      if (status === 'success') {
        const isActuallyAuthenticated = purpose === 'authenticated' || (purpose.includes('verify') && !purpose.includes('email'));
        if (isActuallyAuthenticated) {
          const email = data.email || localStorage.getItem(EMAIL_STORAGE_KEY) || '';
          loginRef.current({ ...data, email, method: 'code' });
        }
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
    
    try {
      console.log('DIAGNOSTIC: Requesting options for:', email);
      const responseData = await AuthApi.getPasskeyOptions(email, deviceName);
      
      // Normalize the entire response recursively
      const normalized = prepareWebAuthnOptions(responseData);
      
      // The library expects the INNER options object (PublicKeyCredentialCreationOptions or PublicKeyCredentialRequestOptions)
      const options = normalized.publicKey || normalized;
      
      console.log('DIAGNOSTIC: Options Normalized. Structure:', options);
      
      // Determine if Registration or Authentication
      const isRegistration = !!(options.user && options.user.id);
      
      let credentialResponse;
      if (isRegistration) {
        console.log('DIAGNOSTIC: Calling startRegistration...');
        credentialResponse = await startRegistration(options);
      } else {
        console.log('DIAGNOSTIC: Calling startAuthentication...');
        credentialResponse = await startAuthentication(options);
      }
      
      console.log('DIAGNOSTIC: Credential received, verifying with server...');
      const result = await AuthApi.verifyPasskey(credentialResponse, email, deviceName);
      
      if (result.status === 'success') {
        const sessionData = { 
          ...result, 
          email: result.email || email, 
          method: 'passkey' 
        };
        login(sessionData as UserSession);
        router.replace('/');
      } else {
        throw new Error(result.purpose || 'Verification failed.');
      }
    } catch (error: any) {
      console.error('DIAGNOSTIC ERROR: [AuthProvider] Authentication Error:', error);
      let errorMessage = error.message || 'Could not sign in with passkey.';
      
      if (error.name === 'SecurityError') {
        errorMessage = 'Domain mismatch: RP ID does not match the current origin.';
      } else if (error.name === 'NotAllowedError') {
        errorMessage = 'Authentication timed out or was cancelled by user.';
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
