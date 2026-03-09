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
 * Utility to clean MIME-wrapped binary strings and ensure Base64URL encoding.
 */
function cleanAndFormatBase64(val: any): any {
  if (typeof val !== 'string') return val;
  
  let cleaned = val;
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
 * Surgically reconstructs the options object to satisfy strict WebAuthn structure.
 * Strips non-standard extensions like 'exts' which trigger library warnings.
 */
function prepareWebAuthnOptions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  const options: any = {};

  // 1. Challenge (Required)
  if (obj.challenge) {
    options.challenge = cleanAndFormatBase64(obj.challenge);
  }

  // 2. RP (Required for Registration)
  if (obj.rp) {
    options.rp = {
      name: obj.rp.name || 'StaffPro',
      id: (obj.rp.id === 'staffpro_mobile' || !obj.rp.id) && typeof window !== 'undefined' 
          ? window.location.hostname 
          : obj.rp.id
    };
  }

  // 3. User (Required for Registration)
  if (obj.user) {
    options.user = {
      id: cleanAndFormatBase64(obj.user.id),
      name: obj.user.name,
      displayName: obj.user.displayName || obj.user.name
    };
  }

  // 4. pubKeyCredParams (Required for Registration)
  if (obj.pubKeyCredParams) {
    options.pubKeyCredParams = obj.pubKeyCredParams.map((p: any) => ({
      type: p.type || 'public-key',
      alg: p.alg
    }));
  }

  // 5. excludeCredentials / allowCredentials
  if (obj.excludeCredentials) {
    options.excludeCredentials = obj.excludeCredentials.map((c: any) => ({
      id: cleanAndFormatBase64(c.id),
      type: c.type || 'public-key',
      transports: c.transports
    }));
  }
  if (obj.allowCredentials) {
    options.allowCredentials = obj.allowCredentials.map((c: any) => ({
      id: cleanAndFormatBase64(c.id),
      type: c.type || 'public-key',
      transports: c.transports
    }));
  }

  // 6. authenticatorSelection
  if (obj.authenticatorSelection) {
    options.authenticatorSelection = { ...obj.authenticatorSelection };
  }

  // 7. attestation
  if (obj.attestation) {
    options.attestation = obj.attestation;
  }

  // 8. timeout
  if (obj.timeout) {
    options.timeout = obj.timeout;
  }

  // 9. Extensions - Only include standard WebAuthn extensions
  if (obj.extensions) {
    const validExtensions: any = {};
    const standardExtensions = ['credProps', 'hmacCreateSecret', 'uvm'];
    for (const key of standardExtensions) {
      if (obj.extensions[key] !== undefined) {
        validExtensions[key] = obj.extensions[key];
      }
    }
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
      
      let rawOptions = responseData.publicKey || responseData;
      let options = prepareWebAuthnOptions(rawOptions);
      
      console.log('PASSKEY: Ceremony Options Object (Final Cleaned):', JSON.stringify(options, null, 2));

      if (!options.challenge) {
        throw new Error('Server response missing "challenge" property.');
      }

      let credentialResponse;
      const isRegistration = !!(options.user && options.pubKeyCredParams);
      
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
      
      // Detailed error mapping for troubleshooting
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Passkey authentication was cancelled or timed out.';
      } else if (error.name === 'SecurityError') {
        errorMessage = `Security Error: The RP ID must match the origin domain (${window.location.hostname}).`;
      } else if (error.name === 'InvalidStateError') {
        errorMessage = 'This device is already registered or the passkey is invalid for this request.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Passkeys are not supported on this browser or device.';
      }
      
      toast({
        title: 'Authentication Failed',
        description: `${error.name}: ${errorMessage}`,
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
