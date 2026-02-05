'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import WebView from '@/components/web-view';
import { Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { UserSession } from '@/types/session';


const CodeVerificationSchema = z.object({
  code: z.string().min(1, { message: 'Please enter the code.' }),
});

type CodeVerificationFormValues = z.infer<typeof CodeVerificationSchema>;

function CodeVerificationOverlay({
  email,
  onSubmitCode,
  onBack,
}: {
  email: string;
  onSubmitCode: (code: string) => void;
  onBack: () => void;
}) {
  const form = useForm<CodeVerificationFormValues>({
    resolver: zodResolver(CodeVerificationSchema),
    defaultValues: { code: '' },
  });

  const handleVerifySubmit = (data: CodeVerificationFormValues) => {
    onSubmitCode(data.code);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
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
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleVerifySubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="XXXXXX"
                          {...field}
                          className="pl-10 text-center tracking-[0.5em]"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2 pt-2">
                <Button type="submit" className="w-full">
                  Verify Code
                </Button>
                <Button onClick={onBack} variant="outline" className="w-full">
                  Back to Login
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}


function MainApp() {
  const { user, isAuthenticated, isLoading, logout, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // IMPORTANT: Adjust this origin to your actual server URL for security
      if (event.origin !== "https://mystaffpro.com") {
        console.warn(`Message from untrusted origin ignored: ${event.origin}`);
        return;
      }
      
      if (event.data && typeof event.data === 'object' && 'status' in event.data) {
        const serverData = event.data as UserSession;

        if (serverData.status === 'success') {
          console.log("Authentication success. Data received:", serverData);
          login(serverData);
          // On success, we navigate to the home page, which removes the overlay
          router.replace('/');
        } else if (serverData.status === 'fail') {
          console.error("Authentication failed:", serverData.purpose);
          toast({
            variant: "destructive",
            title: "Authentication Failed",
            description: serverData.purpose || "An unknown error occurred on the server.",
          });
          // Give user time to read toast before redirecting
          setTimeout(() => {
            logout();
            router.replace('/login');
          }, 3000);
        }
      } else {
         console.log("Message received from iframe (unstructured):", event.data);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [logout, toast, login, router]);

  const isVerifying = searchParams.has('verification');
  const emailForVerification = searchParams.get('email');

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isVerifying) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router, isVerifying]);

  if (isLoading && !isVerifying) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Determine if we should show the verification overlay
  const showVerificationOverlay = isVerifying && !isAuthenticated && emailForVerification;

  // --- URL Construction ---
  const baseUrl = "https://mystaffpro.com/v6/m_mobile";
  let webViewUrl = baseUrl;

  if (isAuthenticated && user) {
     // If the user is properly authenticated, pass their session info.
     webViewUrl = `${baseUrl}?session=${user.session}&email=${user.email}`;
  } else if (isVerifying) {
    // This is the verification flow.
    const params = new URLSearchParams();
    params.set('verification', 'true');
    if(emailForVerification) params.set('email', emailForVerification);
    
    // This will trigger the server to send the email on first load.
    // When the user submits the code, this will send it for verification.
    if (submittedCode) {
      params.set('code', submittedCode);
    }
    
    webViewUrl = `${baseUrl}?${params.toString()}`;
  }
  
  console.log("Loading WebView with URL:", webViewUrl);

  return (
    <main className="relative h-screen">
      {showVerificationOverlay && (
        <CodeVerificationOverlay
          email={emailForVerification!}
          onSubmitCode={(code) => setSubmittedCode(code)}
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

function HomePageContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const isVerificationFlow = searchParams.has('verification');

  if (isLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  // If we are authenticated OR in the process of verifying, show the main app.
  // MainApp has the internal logic to handle all these states.
  if (isAuthenticated || isVerificationFlow) {
    return <MainApp />;
  }
  
  // If not authenticated and not trying to verify, we shouldn't be here. Go to login.
  // This is a fallback, MainApp has a similar redirect.
  if (typeof window !== 'undefined' && window.location.pathname === '/') {
    window.location.href = '/login';
  }

  return null;
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
