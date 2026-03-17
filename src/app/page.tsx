'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2, LogOut, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CodeVerificationOverlay from '@/components/auth/code-verification-overlay';
import { staffproBaseUrl } from '@/lib/config';

function GlobalLoader() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}

function MainPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading, logout, authError, setAuthError } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');
  
  // Clean up URL parameters immediately after successful authentication using client-side router
  useEffect(() => {
    if (isAuthenticated && (isVerifying || searchParams.has('email'))) {
      router.replace('/');
    }
  }, [isAuthenticated, isVerifying, searchParams, router]);

  useEffect(() => {
    if (isLoggingOut) {
      const timer = setTimeout(() => {
        logout();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoggingOut, logout]);

  useEffect(() => {
    // Redirection logic: ONLY redirect to login if we are NOT verifying, NOT logging out, AND have no auth error.
    // If authError exists, we stay here to display the diagnostic info and preserve console logs.
    if (!isAuthLoading && !isAuthenticated && !isVerifying && !isLoggingOut && !authError) {
      router.replace('/login');
    }
  }, [isAuthLoading, isAuthenticated, isVerifying, isLoggingOut, authError, router]);

  const handleCodeSubmit = (code: string) => {
    setVerificationCode(code);
  };
  
  const handleBackToLogin = () => {
    setAuthError(null);
    router.replace('/login');
  };
  
  let url: string | null = null;
  
  if (isLoggingOut && user) {
    const params = new URLSearchParams({
      logoff: 'true',
      email: user.email || '',
      session: user.session,
    });
    url = `${staffproBaseUrl}?${params.toString()}`;
  } else if (isAuthenticated && user) {
    const params = new URLSearchParams({
      session: user.session,
      email: user.email || '',
      origin: typeof window !== 'undefined' ? window.location.origin : '',
    });
    url = `${staffproBaseUrl}?${params.toString()}`;
  } else if (isVerifying && emailForVerification) {
    if (!isAuthenticated) {
      const params = new URLSearchParams({
        verification: 'true',
        email: emailForVerification,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      });
      if (verificationCode) {
        params.append('code', verificationCode);
      }
      url = `${staffproBaseUrl}?${params.toString()}`;
    }
  }

  if (isAuthLoading) {
    return <GlobalLoader />;
  }

  // Display authentication errors clearly and prevent automatic redirects
  if (authError) {
    return (
      <main className="relative h-dvh w-full overflow-hidden bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-destructive">Authentication Error</h2>
          <p className="text-muted-foreground">
            {authError === 'auth-failed' 
              ? 'The passkey flow was interrupted or the device is not registered. Check the console for diagnostic details.' 
              : authError === 'invalid-code' 
                ? 'The verification code provided is invalid or has expired.'
                : 'An unexpected error occurred.'}
          </p>
          <Button onClick={handleBackToLogin} className="w-full">
            Return to Login
          </Button>
        </div>
      </main>
    );
  }

  if (url === null && !isAuthenticated) {
      return <GlobalLoader />;
  }
  
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {url && (
        <WebView 
          key={`staffpro-webview-${isAuthenticated ? 'auth' : 'guest'}-${isVerifying ? 'verify' : 'main'}-${isLoggingOut ? 'logout' : 'active'}`} 
          url={url} 
        />
      )}
      
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
