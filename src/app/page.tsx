'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2 } from 'lucide-react';
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
          onVerify={handleCodeSurender}
        />
      )}

      {isAuthenticated && (
        <Button
          onClick={logout}
          className="absolute bottom-4 right-4 z-20 shadow-lg"
          variant="destructive"
        >
          Restart
        </Button>
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
