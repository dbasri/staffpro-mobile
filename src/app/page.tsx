'use client';

import { Suspense, useEffect, useRef } from 'react';
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
  const { user, isAuthenticated, isLoading: isAuthLoading, login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const processedRedirect = useRef(false);

  // This effect handles the one-time redirect from the server after verification.
  useEffect(() => {
    // Ensure this only runs once and only on the client.
    if (processedRedirect.current || typeof window === 'undefined') {
      return;
    }

    const status = searchParams.get('status');
    if (status) {
      processedRedirect.current = true; // Mark as processed to prevent re-running.
      
      const purpose = searchParams.get('purpose');

      if (status === 'success') {
        const session = searchParams.get('session');
        const email = searchParams.get('email');
        const name = searchParams.get('name');
        
        if (session && email) {
          login({
            status: 'success',
            session,
            email,
            name: name || '',
            purpose: purpose || 'Login via redirect.',
          } as UserSession);
          // After setting auth state, do a full page reload to a clean URL.
          // This is more robust than router.replace() for clearing state.
          window.location.assign('/');
        } else {
           toast({
            variant: 'destructive',
            title: 'Authentication Incomplete',
            description: 'Missing session data from the server.',
          });
          logout();
          router.replace('/login');
        }
      } else { // status === 'fail'
        toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: purpose || 'An unknown error occurred.',
        });
        logout();
        router.replace('/login');
      }
    }
  }, [searchParams, login, logout, router, toast]);

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');

  // This effect handles redirecting unauthenticated users to the login page.
  useEffect(() => {
    // Don't redirect if we are loading, already authenticated, in a verification flow,
    // or currently processing a redirect from the server.
    if (isAuthLoading || isAuthenticated || isVerifying || processedRedirect.current) {
      return;
    }
    router.replace('/login');
  }, [isAuthLoading, isAuthenticated, isVerifying, router]);


  // Render based on the current, stable state.
  if (isAuthLoading || processedRedirect.current) {
    return <GlobalLoader />;
  }
  
  if (isAuthenticated) {
    const baseUrl = "https://mystaffpro.com/v6/m_mobile";
    const webViewUrl = `${baseUrl}?session=${user!.session}&email=${user!.email}`;
    return (
      <main className="relative h-screen">
        <WebView url={webViewUrl} />
        <Button
          onClick={() => {
            logout();
            router.push('/login');
          }}
          className="absolute bottom-4 right-4 z-20 shadow-lg"
          variant="destructive"
        >
          Restart
        </Button>
      </main>
    );
  }
  
  if (isVerifying && emailForVerification) {
    const baseUrl = "https://mystaffpro.com/v6/m_mobile";
    const params = new URLSearchParams(searchParams.toString());
    const webViewUrl = `${baseUrl}?${params.toString()}`;
    return (
      <main className="relative h-screen">
        <CodeVerificationOverlay
          email={emailForVerification}
          onBack={() => {
            router.replace('/login');
          }}
        />
        <WebView url={webViewUrl} />
      </main>
    );
  }

  // Default to loader while figuring out where to go.
  return <GlobalLoader />;
}

export default function Home() {
  return (
    <Suspense fallback={<GlobalLoader />}>
      <MainPage />
    </Suspense>
  );
}
