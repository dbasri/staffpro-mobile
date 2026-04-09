'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2, LogOut, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CodeVerificationOverlay from '@/components/auth/code-verification-overlay';
import { staffproBaseUrl } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const [launchNonce] = useState(() => {
    return Date.now().toString();
  });

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');
  
  useEffect(() => {
    if (!isAuthenticated && !isAuthLoading && !isVerifying && !isLoggingOut) {
      toast({ 
        title: "DEBUG: Auth State Changed", 
        description: "Authenticated is now FALSE. Triggering redirect." 
      });
      router.replace('/login');
    }
  }, [isAuthenticated, isAuthLoading, isVerifying, isLoggingOut, toast, router]);

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

  const handleCodeSubmit = (code: string) => {
    setVerificationCode(code);
  };
  
  const handleBackToLogin = () => {
    setAuthError(null);
    router.replace('/login');
  };
  
  const url = useMemo(() => {
    const storedEmail = typeof window !== 'undefined' ? localStorage.getItem('staffpro-verification-email') : '';
    const currentEmail = user?.email || emailForVerification || storedEmail || '';
    const isNewLogin = typeof window !== 'undefined' && sessionStorage.getItem('staffpro-new-login') === 'true';

    if (isLoggingOut && user) {
      const params = new URLSearchParams({
        logoff: 'true',
        email: currentEmail,
        session: user.session,
      });
      return `${staffproBaseUrl}?${params.toString()}`;
    } 
    
    if (isAuthenticated && user) {
      const params = new URLSearchParams({
        session: user.session,
        email: user.email || currentEmail,
        launch: launchNonce,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      });
      
      if (isNewLogin) {
        params.append('content', 'true');
      }
      
      return `${staffproBaseUrl}?${params.toString()}`;
    } 
    
    if (isVerifying && emailForVerification) {
      if (!isAuthenticated) {
        const params = new URLSearchParams({
          verification: 'true',
          email: currentEmail,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        });
        if (verificationCode) {
          params.append('code', verificationCode);
        }
        return `${staffproBaseUrl}?${params.toString()}`;
      }
    }

    return null;
  }, [isAuthenticated, user, isLoggingOut, isVerifying, emailForVerification, verificationCode, launchNonce]);

  if (isAuthLoading) {
    return <GlobalLoader />;
  }

  if (authError) {
    return (
      <main className="relative h-dvh w-full overflow-hidden bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-destructive">Authentication Error</h2>
          <p className="text-muted-foreground text-sm">
            The passkey flow was interrupted or timed out.
          </p>
          <Button onClick={handleBackToLogin} className="w-full">
            Return to Login
          </Button>
        </div>
      </main>
    );
  }

  if (!isAuthenticated && !isVerifying) {
    return <GlobalLoader />;
  }
  
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {url && (
        <WebView 
          key={`staffpro-webview-${isAuthenticated ? 'auth' : 'guest'}-${launchNonce}`} 
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
        <div className="absolute z-20 pointer-events-none px-4 w-full portrait:bottom-6 portrait:left-0 portrait:right-0 portrait:flex portrait:justify-center landscape:top-6 landscape:right-6 landscape:left-auto landscape:flex landscape:justify-end">
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
