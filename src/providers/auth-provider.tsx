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
 * Utility to clean MIME-wrapped binary strings and ensure strict Base64URL encoding.
 * WebAuthn challenge and IDs MUST be Base64URL (no padding, - and _ instead of + and /).
 */
function cleanAndFormatBase64(val: any): string {
  if (typeof val !== 'string') return '';
  
  let cleaned = val;
  // Strip MIME binary headers if present
  if (cleaned.startsWith('=?BINARY?B?')) {
    cleaned = cleaned.replace('=?BINARY?B?', '').replace('?=', '');
  }
  
  // Convert standard Base64 to Base64URL (required by SimpleWebAuthn)
  return cleaned
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Surgically reconstructs the options object to satisfy strict WebAuthn JSON schema.
 * Strips non-standard extensions like 'exts' which trigger library warnings.
 */
function prepareWebAuthnOptions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  // Detect if this is an authentication or registration ceremony
  const isRegistration = !!(obj.user && obj.user.id);

  // We construct a brand new object using ONLY standard WebAuthn keys.
  // This satisfies the @simplewebauthn/browser's strict JSON schema check.
  const options: any = {
    challenge: cleanAndFormatBase64(obj.challenge),
    rp: {
      name: obj.rp?.name || 'StaffPro',
      id: obj.rp?.id
    },
    timeout: Number(obj.timeout) || 60000,
  };

  if (isRegistration) {
    options.user = {
      id: cleanAndFormatBase64(obj.user.id),
      name: obj.user.name || '',
      displayName: obj.user.displayName || obj.user.name || ''
    };
    options.pubKeyCredParams = (obj.pubKeyCredParams || []).map((p: any) => ({
      type: 'public-key',
      alg: Number(p.alg)
    }));
    options.attestation = obj.attestation || 'none';
    
    if (obj.authenticatorSelection) {
      options.authenticatorSelection = {
        userVerification: obj.authenticatorSelection.userVerification || 'preferred',
        residentKey: obj.authenticatorSelection.residentKey || 'preferred',
        requireResidentKey: obj.authenticatorSelection.requireResidentKey ?? false
      };
      if (obj.authenticatorSelection.authenticatorAttachment) {
        options.authenticatorSelection.authenticatorAttachment = obj.authenticatorSelection.authenticatorAttachment;
      }
    }

    if (obj.excludeCredentials) {
      options.excludeCredentials = (obj.excludeCredentials || []).map((c: any) => ({
        id: cleanAndFormatBase64(c.id),
        type: 'public-key',
        transports: c.transports
      }));
    }
  } else {
    // Authentication specific fields
    if (obj.allowCredentials) {
      options.allowCredentials = (obj.allowCredentials || []).map((c: any) => ({
        id: cleanAndFormatBase64(c.id),
        type: 'public-key',
        transports: c.transports
      }));
    }
    options.userVerification = obj.userVerification || 'preferred';
  }

  // Extensions are stripped unless they are known standards to avoid "refactor" warnings
  if (obj.extensions && typeof obj.extensions === 'object') {
    const validExtensions: any = {};
    if (obj.extensions.credProps !== undefined) validExtensions.credProps = obj.extensions.credProps;
    if (obj.extensions.hmacCreateSecret !== undefined) validExtensions.hmacCreateSecret = obj.extensions.hmacCreateSecret;
    if (Object.keys(validExtensions).length > 0) {
      options.extensions = validExtensions;
    }
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
  if (/Linux/.test(ua)) return 'Linux Device';
  return 'Mobile/Web Browser';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
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
      
      console.log('PASSKEY: Ceremony Options Object (Final Cleaned):', JSON.stringify(options, null, 2));

      if (!options.challenge) {
        throw new Error('Server response missing "challenge" property.');
      }

      let credentialResponse;
      const isRegistration = !!(options.user && options.user.id);
      
      if (isRegistration) {
        console.log('PASSKEY: Detected Registration Options. Starting registration ceremony...');
        credentialResponse = await startRegistration(options);
      } else {
        console.log('PASSKEY: Detected Authentication Options. Starting authentication ceremony...');
        credentialResponse = await startAuthentication(options);
      }
      
      const result = await AuthApi.verifyPasskey(credentialResponse, email, deviceName);
      
      if (result.status === 'success') {
        login({ ...result, method: 'passkey' });
      } else {
        throw new Error(result.purpose || 'Passkey verification failed.');
      }
    } catch (error: any) {
      console.error('PASSKEY: Error in passkeyLogin flow:', error);
      let errorMessage = error.message || 'Could not sign in with passkey.';
      
      if (error.name === 'SecurityError') {
        errorMessage = `SecurityError: The RP ID must match the origin domain (${window.location.hostname}).`;
      } else if (error.name === 'NotAllowedError') {
        errorMessage = 'Permissions Policy block or user cancelled. Ensure you are in a top-level tab (pop-out window).';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Passkeys/Biometrics are not supported on this device/browser.';
      }
      
      toast({
        title: 'Authentication Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [login, toast]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, isLoading, authError, login, passkeyLogin, logout, setAuthError }}
    >
      {children}
    </AuthContext.Provider>
  );
}
