'use client';

import { Suspense, useEffect } from 'react';
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

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');

  // Add the message listener here, tied to the verification flow.
  useEffect(() => {
    if (!isVerifying) {
      return;
    }

    const handleServerMessage = (event: MessageEvent) => {
      // IMPORTANT: Always verify the origin of the message for security
      if (event.origin !== 'https://mystaffpro.com') {
        return;
      }

      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        // Ignore messages that are not valid JSON
        return;
      }

      if (data.status === 'success' && data.session) {
        login(data as UserSession);
      } else if (data.status === 'fail') {
        toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description:
            data.purpose || 'An unknown error occurred on the server.',
        });
        // On failure, logout() will redirect to the login page.
        logout();
      }
    };

    window.addEventListener('message', handleServerMessage);

    // Cleanup function to remove the listener when the component unmounts
    return () => {
      window.removeEventListener('message', handleServerMessage);
    };
  }, [isVerifying, login, logout, toast]);


  // This effect handles redirecting unauthenticated users to the login page.
  useEffect(() => {
    // Don't redirect if we are loading, already authenticated, or in a verification flow
    if (isAuthLoading || isAuthenticated || isVerifying) {
      return;
    }
    window.location.assign('/login');
  }, [isAuthLoading, isAuthenticated, isVerifying]);

  // Render based on the current, stable state.
  if (isAuthLoading) {
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
