'use client';

import { Suspense, useEffect } from 'react';
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

function MainPage() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // This effect handles the login redirect from the server
  useEffect(() => {
    const status = searchParams.get('status');
    const session = searchParams.get('session');
    const email = searchParams.get('email');
    const name = searchParams.get('name');
    const purpose = searchParams.get('purpose');
    const hasAuthParams = status && (session || purpose);

    if (hasAuthParams) {
      if (status === 'success' && session && email) {
        login({
          status: 'success',
          session,
          email,
          name: name || '',
          purpose: purpose || 'Login via redirect.',
        } as UserSession);
        // Clean the URL to remove auth params from the address bar
        router.replace('/');
      } else if (status === 'fail') {
        toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: purpose || 'An unknown error occurred during verification.',
        });
        logout();
        // Clean the URL and go back to login
        router.replace('/login');
      } else {
        // Clean the URL to remove unexpected auth params from the address bar
        router.replace('/');
      }
    }
  }, [searchParams, login, logout, router, toast]);

  // This effect handles redirecting unauthenticated users to the login page
  useEffect(() => {
    // Wait until the auth state is loaded
    if (isLoading) {
      return;
    }
    
    // If user is authenticated, do nothing.
    if (isAuthenticated) {
      return;
    }

    // Don't redirect if we are processing auth params from a redirect
    // or if we are in the middle of a verification flow.
    const isVerifying = searchParams.has('verification');
    const isProcessingAuth = searchParams.has('status');

    if (!isVerifying && !isProcessingAuth) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  if (isLoading || (!isAuthenticated && !searchParams.has('verification') && !searchParams.has('status'))) {
    // Show a loader while the initial auth state is being determined,
    // or while we are redirecting an unauthenticated user to login.
    return <GlobalLoader />;
  }
  
  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');
  const showVerificationOverlay = isVerifying && emailForVerification && !isAuthenticated;
  
  const baseUrl = "https://mystaffpro.com/v6/m_mobile";
  let webViewUrl = baseUrl;

  if (isAuthenticated && user) {
     webViewUrl = `${baseUrl}?session=${user.session}&email=${user.email}`;
  } else if (isVerifying) {
    // Pass all current search params to the iframe
    const params = new URLSearchParams(searchParams.toString());
    webViewUrl = `${baseUrl}?${params.toString()}`;
  }
  
  return (
    <main className="relative h-screen">
      {showVerificationOverlay && (
        <CodeVerificationOverlay
          email={emailForVerification!}
          onBack={() => {
            logout();
            router.replace('/login');
          }}
        />
      )}

      {(isVerifying || isAuthenticated) && <WebView url={webViewUrl} />}
      
      {isAuthenticated && (
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
