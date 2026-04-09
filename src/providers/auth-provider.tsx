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
const DEVICE_ID_KEY = 'staffpro-device-id';
const NEW_LOGIN_KEY = 'staffpro-new-login';

function normalizeBase64URL(str: string): string {
  if (!str || typeof str !== 'string') return str;
  
  let cleanStr = str;
  if (str.startsWith('=?BINARY?B?')) {
    const b64 = str.replace(/^=\?BINARY\?B\?/, '').replace(/\?=$/, '').trim();
    const paddedB64 = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
    
    try {
      const decoded = atob(paddedB64);
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

function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown Device';
  
  let deviceSuffix = '';
  try {
    deviceSuffix = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!deviceSuffix) {
      deviceSuffix = Math.floor(1000 + Math.random() * 9000).toString();
      localStorage.setItem(DEVICE_ID_KEY, deviceSuffix);
    }
  } catch (e) {
    deviceSuffix = '0000';
  }

  const ua = window.navigator.userAgent;
  let model = 'Mobile Device';
  
  if (/iPhone|iPad/.test(ua)) {
    model = 'Apple Device';
  } else if (/Android/.test(ua)) {
    const match = ua.match(/Android\s+([0-9.]+);\s+([^;)]+)/);
    if (match) {
      const hwModel = match[2].split('Build/')[0].trim();
      if (hwModel.length < 2 || /^(Mobile|wv|K|Android)$/i.test(hwModel)) {
        model = `Android ${match[1]} Device`;
      } else {
        model = hwModel;
      }
    } else {
      model = 'Android Device';
    }
  } else if (/Windows NT/.test(ua)) {
    model = 'Windows PC';
  } else if (/Macintosh/.test(ua)) {
    model = 'Mac';
  }
  
  return `${model} ${deviceSuffix}`;
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
      sessionStorage.setItem(NEW_LOGIN_KEY, 'true');
    } catch (error) {}
  }, []);

  const logout = useCallback(() => {
    toast({ title: "DEBUG: Logout Triggered", description: "Clearing session and redirecting." });
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(NEW_LOGIN_KEY);
    } catch (error) {}
    setUser(null);
    setAuthError(null);
    router.replace('/login');
  }, [router, toast]);

  useEffect(() => {
    const handleServerMessage = (event: MessageEvent) => {
      let data = event.data;
      
      // DIAGNOSTIC: Immediate root check for ANY postMessage arrival
      if (data) {
        toast({ title: "DEBUG: Message Received", description: "A signal has arrived at the Provider." });
      }
      
      if (typeof data === 'string') {
        try {
          const start = data.indexOf('{');
          const end = data.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            data = JSON.parse(data.substring(start, end + 1));
          } else return;
        } catch (e) { return; }
      }
      
      if (!data || typeof data !== 'object') return;

      const status = (data.status || data.Status || '').toString().toLowerCase();
      const purpose = (data.purpose || data.Purpose || '').toString().toLowerCase();
      
      if (status || purpose) {
        toast({ title: "DEBUG: Data Parsed", description: `Status: ${status}, Purpose: ${purpose}` });
      }

      const isLogoffSignal = 
        status === 'logoff' || 
        status === 'fail' || 
        purpose === 'logoff' || 
        purpose === 'logout' || 
        data.logoff === true || 
        data.Logoff === true ||
        data.logout === true;

      if (isLogoffSignal) {
        toast({ title: "DEBUG: Logoff Signal Identified", description: "Executing logout sequence." });
        logout();
        return;
      }

      if (status === 'success' && purpose === 'authenticated') {
        toast({ title: "DEBUG: Auth Success", description: "Activating session." });
        const email = data.email || localStorage.getItem(EMAIL_STORAGE_KEY) || '';
        const session = data.session || 'passkey-session';
        login({ ...data, email, session });
      }
    };

    window.addEventListener('message', handleServerMessage);
    return () => window.removeEventListener('message', handleServerMessage);
  }, [login, logout, toast]);

  useEffect(() => {
    try {
      const sessionString = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionString) {
        const session = JSON.parse(sessionString);
        const statusLower = (session.status || session.Status || '').toLowerCase();
        if (statusLower === 'success') {
          setUser(session);
        }
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
      
      const statusLower = (result.status || result.Status || '').toLowerCase();
      if (statusLower === 'success') {
        login({ 
          ...result, 
          email: result.email || email, 
          session: result.session || 'passkey-session',
          method: 'passkey' 
        } as UserSession);
        
        router.replace('/');
      } else {
        throw new Error(result.purpose || 'Verification failed');
      }
    } catch (error: any) {
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
