'use client';

import { Suspense, useEffect, useState } from 'react';
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
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');

  const baseUrl = "https://mystaffpro.com/v6/m_mobile";

  // Effect to set the correct URL based on auth state or verification flow
  useEffect(() => {
    if (isAuthenticated && user) {
      setCurrentUrl(`${baseUrl}?session=${user.session}&email=${user.email}`);
    } else if (isVerifying && emailForVerification) {
        const params = new URLSearchParams({
          verification: 'true',
          email: emailForVerification,
        });
        if (typeof window !== 'undefined') {
          params.append('origin', window.location.origin);
        }
        setCurrentUrl(`${baseUrl}?${params.toString()}`);
    }
  }, [isAuthenticated, user, isVerifying, emailForVerification, baseUrl]);


  // Effect to redirect unauthenticated users to the login page
  useEffect(() => {
    if (isAuthLoading || isAuthenticated || isVerifying) {
      return;
    }
    window.location.assign('/login');
  }, [isAuthLoading, isAuthenticated, isVerifying]);

  const handleCodeSubmit = (code: string) => {
    if (emailForVerification) {
        const params = new URLSearchParams({
            verification: 'true',
            email: emailForVerification,
            code: code,
            origin: window.location.origin,
        });
        setCurrentUrl(`${baseUrl}?${params.toString()}`);
    }
  };

  if (isAuthLoading) {
    return <GlobalLoader />;
  }

  if (isAuthenticated) {
    if (!currentUrl) return <GlobalLoader />;
    return (
      <main className="relative h-screen">
        <WebView url={currentUrl} />
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
    if (!currentUrl) return <GlobalLoader />;
    return (
      <main className="relative h-screen">
        <CodeVerificationOverlay
          email={emailForVerification}
          onBack={() => {
            window.location.assign('/login');
          }}
          onVerify={handleCodeSubmit}
        />
        <WebView url={currentUrl} />
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
