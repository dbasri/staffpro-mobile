'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UserSession } from '@/types/session';
import { useToast } from '@/hooks/use-toast';
import CodeVerificationOverlay from '@/components/auth/code-verification-overlay';

function GlobalLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}

type PageState = 'LOADING' | 'PROCESSING_REDIRECT' | 'AWAITING_VERIFICATION' | 'AUTHENTICATED' | 'REDIRECTING_TO_LOGIN';

function MainPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading, login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pageState, setPageState] = useState<PageState>('LOADING');

  useEffect(() => {
    const status = searchParams.get('status');
    const hasAuthParams = !!status;
    const isVerifying = searchParams.has('verification');

    // Priority 1: Handle server redirect
    if (hasAuthParams) {
      setPageState('PROCESSING_REDIRECT');
      const session = searchParams.get('session');
      const email = searchParams.get('email');
      const name = searchParams.get('name');
      const purpose = searchParams.get('purpose');

      if (status === 'success' && session && email) {
        login({
          status: 'success',
          session,
          email,
          name: name || '',
          purpose: purpose || 'Login via redirect.',
        } as UserSession);
        // On successful login, the URL is cleaned and a re-render is triggered.
        // The next run of this effect will set the state to 'AUTHENTICATED'.
        router.replace('/');
      } else { // status === 'fail' or other
        toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: purpose || 'An unknown error occurred.',
        });
        logout();
        router.replace('/login');
      }
      return;
    }

    // After redirects, check auth loading state
    if (isAuthLoading) {
      setPageState('LOADING');
      return;
    }

    // Priority 2: User is authenticated
    if (isAuthenticated) {
      setPageState('AUTHENTICATED');
      return;
    }

    // Priority 3: User is in the middle of verification flow
    if (isVerifying) {
      setPageState('AWAITING_VERIFICATION');
      return;
    }
    
    // Priority 4: User is unauthenticated and not doing anything else
    setPageState('REDIRECTING_TO_LOGIN');
    router.replace('/login');

  }, [searchParams, isAuthLoading, isAuthenticated, login, logout, router, toast]);

  // Render based on state
  if (pageState === 'LOADING' || pageState === 'PROCESSING_REDIRECT' || pageState === 'REDIRECTING_TO_LOGIN') {
    return <GlobalLoader />;
  }

  const emailForVerification = searchParams.get('email');
  const showVerificationOverlay = pageState === 'AWAITING_VERIFICATION' && !!emailForVerification;

  const baseUrl = "https://mystaffpro.com/v6/m_mobile";
  let webViewUrl = baseUrl;

  if (pageState === 'AUTHENTICATED' && user) {
     webViewUrl = `${baseUrl}?session=${user.session}&email=${user.email}`;
  } else if (pageState === 'AWAITING_VERIFICATION') {
    const params = new URLSearchParams(searchParams.toString());
    webViewUrl = `${baseUrl}?${params.toString()}`;
  }
  
  return (
    <main className="relative h-screen">
      {showVerificationOverlay && (
        <CodeVerificationOverlay
          email={emailForVerification!}
          onBack={() => {
            router.replace('/login');
          }}
        />
      )}

      {(pageState === 'AWAITING_VERIFICATION' || pageState === 'AUTHENTICATED') && <WebView url={webViewUrl} />}
      
      {pageState === 'AUTHENTICATED' && (
        <Button
          onClick={() => logout()}
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
  // Suspense is needed because MainPage uses useSearchParams()
  return (
    <Suspense fallback={<GlobalLoader />}>
      <MainPage />
    </Suspense>
  );
}
