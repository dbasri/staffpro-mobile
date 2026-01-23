'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import WebView from '@/components/web-view';
import { Loader2, MailCheck } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function VerificationScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('email');

  if (!email) {
    // This shouldn't happen if navigated from the form, but handle it just in case.
    useEffect(() => {
      router.replace('/login');
    }, [router]);
    return null;
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Check your inbox</CardTitle>
          <CardDescription>
            A verification code has been sent to{' '}
            <span className="font-semibold text-foreground">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-muted-foreground">
            (This is a prototype. No email was actually sent.)
          </p>
          <Button onClick={() => router.push('/login')} variant="outline">
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MainApp() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="relative h-screen">
      <WebView url="https://mystaffpro.com/v6/m_mobile" />
      <Button
        onClick={() => logout()}
        className="absolute bottom-4 right-4 z-20 shadow-lg"
        variant="destructive"
      >
        Restart
      </Button>
    </main>
  );
}

// Next.js Suspense and useSearchParams work together.
// We wrap the component tree in a Suspense boundary.
// https://nextjs.org/docs/app/building-your-application/rendering/client-components#suspense-and-usesearchparams
function HomePageContent() {
  const searchParams = useSearchParams();
  const isVerificationFlow = searchParams.get('verification') === 'true';

  if (isVerificationFlow) {
    return <VerificationScreen />;
  }

  return <MainApp />;
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
