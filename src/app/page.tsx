'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CodeVerificationOverlay from '@/components/auth/code-verification-overlay';
import { staffproBaseUrl } from '@/lib/config';

function GlobalLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}

function MainPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading, logout, authError, setAuthError } = useAuth();
  const searchParams = useSearchParams();
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');
  
  useEffect(() => {
    if (isLoggingOut) {
      const timer = setTimeout(() => {
        logout();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoggingOut, logout]);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && !isVerifying && !isLoggingOut) {
      window.location.assign('/login');
    }
  }, [isAuthLoading, isAuthenticated, isVerifying, isLoggingOut]);

  const handleCodeSubmit = (code: string) => {
    setVerificationCode(code);
  };
  
  const handleBackToLogin = () => {
    setAuthError(null);
    window.location.assign('/login');
  };
  
  let url: string | null = null;
  
  if (isLoggingOut && user) {
    const params = new URLSearchParams({
      logoff: 'true',
      email: user.email,
      session: user.session,
    });
    url = `${staffproBaseUrl}?${params.toString()}`;
  } else if (isAuthenticated && user) {
    const params = new URLSearchParams({
      session: user.session,
      email: user.email,
      origin: window.location.origin,
    });
    url = `${staffproBaseUrl}?${params.toString()}`;
  } else if (isVerifying && emailForVerification) {
    const params = new URLSearchParams({
      verification: 'true',
      email: emailForVerification,
      origin: window.location.origin,
    });
    if (verificationCode) {
      params.append('code', verificationCode);
    }
    url = `${staffproBaseUrl}?${params.toString()}`;
  }

  if (isAuthLoading) {
    return <GlobalLoader />;
  }

  if (url === null) {
      return <GlobalLoader />;
  }
  
  return (
    <main className="relative h-screen">
      <WebView key={`staffpro-webview-${isVerifying ? 'verify' : 'main'}`} url={url} />
      
      {isVerifying && !isAuthenticated && (
        <CodeVerificationOverlay
          email={emailForVerification!}
          isInvalid={authError === 'invalid-code'}
          onBack={handleBackToLogin}
          onVerify={handleCodeSubmit}
        />
      )}

      {isAuthenticated && !isLoggingOut && (
        <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
          <Button
            onClick={() => setIsLoggingOut(true)}
            style={{ backgroundColor: '#35ade9' }}
            className="pointer-events-auto flex items-center gap-2 rounded-full px-8 shadow-2xl transition-transform hover:scale-105 active:scale-95 font-semibold text-white"
            size="lg"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<GlobalLoader />}>
      <MainPage />
    </Suspense>
  );
}
