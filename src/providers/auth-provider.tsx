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

/**
 * Normalizes strings for WebAuthn.
 * 1. Strips PHP binary wrappers (=?BINARY?B?...?=)
 * 2. Detects 64-char Hex strings (32-byte challenges) and converts them to binary bytes.
 * 3. Converts into a clean, padding-free Base64URL format for the browser API.
 */
function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return '';
  
  // 1. Strip PHP-style BINARY wrappers
  let cleanStr = str.replace(/^=\?BINARY\?B\?/, '').replace(/\?=$/, '').trim();
  
  // 2. Detect if it's a 64-character hex string (representing 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(cleanStr)) {
    let rawBytes = '';
    for (let i = 0; i < cleanStr.length; i += 2) {
      rawBytes += String.fromCharCode(parseInt(cleanStr.substr(i, 2), 16));
    }
    return btoa(rawBytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // 3. Fallback for PHP-wrapped Base64 or standard Base64
  try {
    const decoded = atob(cleanStr.replace(/-/g, '+').replace(/_/g, '/'));
    return btoa(decoded)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  } catch (e) {
    try {
      return btoa(cleanStr)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } catch (inner) {
      console.error('AUTH: Normalization failed for string:', cleanStr);
      return '';
    }
  }
}

/**
 * Reconstructs the options object to satisfy strict WebAuthn standards.
 */
function prepareWebAuthnOptions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  const isRegistration = !!(obj.user && obj.user.id);

  const options: any = {
    challenge: normalizeBase64URL(obj.challenge),
    timeout: Number(obj.timeout) || 60000,
    rp: {
      name: obj.rp?.name || 'StaffPro',
      id: obj.rp?.id, 
    },
  };

  if (isRegistration) {
    options.user = {
      id: normalizeBase64URL(obj.user.id),
      name: obj.user.name || '',
      displayName: obj.user.displayName || obj.user.name || ''
    };
    options.pubKeyCredParams = (obj.pubKeyCredParams || []).map((p: any) => ({
      type: 'public-key',
      alg: Number(p.alg)
    }));
    // Use 'none' attestation to avoid certificate chain verification errors on the server
    options.attestation = 'none';
    if (obj.authenticatorSelection) {
      options.authenticatorSelection = obj.authenticatorSelection;
    }
  } else {
    if (obj.allowCredentials) {
      options.allowCredentials = (obj.allowCredentials || []).map((c: any) => ({
        id: normalizeBase64URL(c.id),
        type: 'public-key',
        transports: c.transports
      }));
    }
    options.userVerification = obj.userVerification || 'preferred';
  }

  return options;
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
    if (typeof window !== 'undefined') {
      window.location.replace(window.location.origin);
    }
  }, []);

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
          loginRef.current({ ...data, method: 'code' });
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
      
      if (!options.challenge) {
        throw new Error('Server response missing "challenge" property.');
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
        login({ ...result, method: 'passkey' });
        router.replace('/');
      } else {
        throw new Error(result.purpose || 'Passkey verification failed.');
      }
    } catch (error: any) {
      console.error('PASSKEY: Error:', error);
      let errorMessage = error.message || 'Could not sign in with passkey.';
      
      if (error.name === 'SecurityError') {
        errorMessage = `SecurityError: The RP ID must match the origin domain (${window.location.hostname}).`;
      } else if (error.name === 'NotAllowedError') {
        errorMessage = 'Permissions Policy block or user cancelled. Ensure you are in a top-level tab.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Passkeys/Biometrics are not supported on this device/browser.';
      } else if (error.name === 'InvalidCharacterError') {
        errorMessage = 'Encoding Error: The server challenge could not be processed. Ensure the server sends a valid Hex or Base64 string.';
      }
      
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
