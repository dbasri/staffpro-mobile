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
  const { user, isAuthenticated, isLoading: isAuthLoading, logout } = useAuth();
  const searchParams = useSearchParams();
  const [verificationCode, setVerificationCode] = useState<string | null>(null);

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');
  
  // Redirect to login if not authenticated or verifying
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && !isVerifying) {
      window.location.assign('/login');
    }
  }, [isAuthLoading, isAuthenticated, isVerifying]);

  // Handle code submission by updating state
  const handleCodeSubmit = (code: string) => {
    setVerificationCode(code);
  };
  
  // Determine the URL based on the current state
  let url: string | null = null;
  if (isAuthenticated && user) {
    // Final authenticated URL
    const params = new URLSearchParams({
      session: user.session,
      email: user.email,
      origin: window.location.origin,
    });
    url = `${staffproBaseUrl}?${params.toString()}`;
  } else if (isVerifying && emailForVerification) {
    // URL for verification flow
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

  // Render logic based on application state
  if (isAuthLoading) {
    return <GlobalLoader />;
  }

  if (url === null) {
      // This can happen briefly before the redirect effect kicks in
      return <GlobalLoader />;
  }
  
  return (
    <main className="relative h-screen">
      <WebView key="staffpro-webview" url={url} />
      
      {isVerifying && !isAuthenticated && (
        <CodeVerificationOverlay
          email={emailForVerification!}
          onBack={() => window.location.assign('/login')}
          onVerify={handleCodeSubmit}
        />
      )}

      {isAuthenticated && (
        <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
          <Button
            onClick={logout}
            variant="destructive"
            className="pointer-events-auto flex items-center gap-2 rounded-full px-6 shadow-2xl transition-transform hover:scale-105 active:scale-95"
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
