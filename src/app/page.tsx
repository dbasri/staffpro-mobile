'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CodeVerificationOverlay from '@/components/auth/code-verification-overlay';

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

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');

  const baseUrl = "https://mystaffpro.com/v6/m_mobile";

  useEffect(() => {
    if (isAuthLoading || isAuthenticated || isVerifying) {
      return;
    }
    window.location.assign('/login');
  }, [isAuthLoading, isAuthenticated, isVerifying]);

  if (isAuthLoading) {
    return <GlobalLoader />;
  }

  if (isAuthenticated) {
    const webViewUrl = `${baseUrl}?session=${user!.session}&email=${user!.email}`;
    return (
      <main className="relative h-screen">
        <WebView url={webViewUrl} />
        <Button
          onClick={logout}
          className="absolute bottom-4 right-4 z-20 shadow-lg"
          variant="destructive"
        >
          Restart
        </Button>
      </main>
    );
  }

  if (isVerifying && emailForVerification) {
    const params = new URLSearchParams({
      verification: 'true',
      email: emailForVerification,
    });
    const webViewUrl = `${baseUrl}?${params.toString()}`;
    return (
      <main className="relative h-screen">
        <CodeVerificationOverlay
          email={emailForVerification}
          onBack={() => {
            window.location.assign('/login');
          }}
        />
        <WebView url={webViewUrl} />
      </main>
    );
  }

  return <GlobalLoader />;
}

export default function Home() {
  return (
    <Suspense fallback={<GlobalLoader />}>
      <MainPage />
    </Suspense>
  );
}
