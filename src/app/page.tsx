'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CodeVerificationOverlay from '@/components/auth/code-verification-overlay';
import { useToast } from '@/hooks/use-toast';
import type { UserSession } from '@/types/session';

function GlobalLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}

function MainPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading, login, logout } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // Refs to hold the latest versions of the functions from hooks.
  // This allows us to use them in a stable `useEffect` listener.
  const loginRef = useRef(login);
  const logoutRef = useRef(logout);
  const toastRef = useRef(toast);

  // Keep the refs updated on every render.
  useEffect(() => {
    loginRef.current = login;
    logoutRef.current = logout;
    toastRef.current = toast;
  }, [login, logout, toast]);
  
  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');
  
  const baseUrl = "https://mystaffpro.com/v6/m_mobile";

  // This `useEffect` now has stable dependencies and will only run when `isVerifying` changes.
  // This creates a persistent listener for the duration of the verification flow.
  useEffect(() => {
    if (!isVerifying) {
      return;
    }

    const handleServerMessage = (event: MessageEvent) => {
      console.log('--- MESSAGE RECEIVED ---');
      console.log('--- Origin:', event.origin);
      console.log('--- Data:', event.data);
      
      const expectedOrigin = new URL(baseUrl).origin;
      if (event.origin !== expectedOrigin) {
        console.log(`--- Origin mismatch. Expected: ${expectedOrigin}, Received: ${event.origin}. IGNORING.`);
        return;
      }
      console.log('--- Origin matched. Processing message...');

      let data;
      try {
        data = JSON.parse(event.data);
        console.log('--- Parsed data:', data);
      } catch (e) {
        console.log('--- FAILED TO PARSE JSON. IGNORING.', e);
        return;
      }

      if (data.status === 'success' && data.session) {
        console.log('--- SUCCESS message received. Calling login()...');
        loginRef.current(data as UserSession);
      } else if (data.status === 'fail') {
        console.log('--- FAIL message received. Toasting and logging out...');
        toastRef.current({
          variant: 'destructive',
          title: 'Authentication Failed',
          description:
            data.purpose || 'An unknown error occurred on the server.',
        });
        logoutRef.current();
      } else {
        console.log('--- Unknown message format. IGNORING.');
      }
    };
    
    console.log('--- ADDING STABLE MESSAGE LISTENER ---');
    window.addEventListener('message', handleServerMessage);

    // Cleanup function to remove the listener when the component unmounts or `isVerifying` becomes false.
    return () => {
      console.log('--- REMOVING STABLE MESSAGE LISTENER ---');
      window.removeEventListener('message', handleServerMessage);
    };
  }, [isVerifying, baseUrl]);


  // This effect handles redirecting unauthenticated users to the login page.
  useEffect(() => {
    // Don't redirect if we are loading, already authenticated, or in a verification flow
    if (isAuthLoading || isAuthenticated || isVerifying) {
      return;
    }
    // Use a hard redirect to ensure a clean state.
    window.location.assign('/login');
  }, [isAuthLoading, isAuthenticated, isVerifying]);

  // Render based on the current, stable state.
  if (isAuthLoading) {
    return <GlobalLoader />;
  }

  if (isAuthenticated) {
    const webViewUrl = `${baseUrl}?session=${user!.session}&email=${user!.email}`;
    return (
      <main className="relative h-screen">
        <WebView url={webViewUrl} />
        <Button
          onClick={() => {
            logout();
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
    // We only pass 'verification' and 'email' to the initial iframe URL
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
            // Use a hard redirect to prevent "ghost" iframe reloads.
            window.location.assign('/login');
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
