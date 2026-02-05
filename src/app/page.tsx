'use client';

import { Suspense, useEffect } from 'react';
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

function VerificationScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('email');

  const form = useForm<CodeVerificationFormValues>({
    resolver: zodResolver(CodeVerificationSchema),
    defaultValues: {
      code: '',
    },
  });

  useEffect(() => {
    if (!email) {
      router.replace('/login');
    }
  }, [email, router]);

  const handleVerifySubmit = (data: CodeVerificationFormValues) => {
    // Redirect to the main page with the correct query params
    // The main app will handle the login after receiving the postMessage
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.set('code', data.code);
    router.replace(`/?${newSearchParams.toString()}`);
  };

  if (!email) {
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
                <Button
                  onClick={() => router.push('/login')}
                  variant="outline"
                  className="w-full"
                >
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
  const { isAuthenticated, isLoading, logout, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // IMPORTANT: Always verify the origin of the message for security.
      // In a real app, this should be a specific, trusted URL.
      if (event.origin !== "https://mystaffpro.com") {
        console.warn(`Message from untrusted origin ignored: ${event.origin}`);
        return;
      }
      
      if (event.data && typeof event.data === 'object' && 'status' in event.data) {
        const serverData = event.data as UserSession;

        if (serverData.status === 'success') {
          console.log("Authentication success. Data received:", serverData);
          login(serverData);
        } else if (serverData.status === 'fail') {
          console.error("Authentication failed:", serverData.purpose);
          toast({
            variant: "destructive",
            title: "Authentication Failed",
            description: serverData.purpose || "An unknown error occurred on the server.",
          });
          setTimeout(() => {
            logout();
            router.replace('/login');
          }, 2000);
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isVerifying) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router, isVerifying]);


  if (isLoading || (!isAuthenticated && isVerifying && !searchParams.has('code'))) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const baseUrl = "https://mystaffpro.com/v6/m_mobile";
  let webViewUrl = baseUrl;
  
  // Only append params if we are in the verification flow.
  // An already authenticated user should just load the base URL.
  if (isVerifying) {
    const paramsString = searchParams.toString();
    if (paramsString) {
      webViewUrl = `${baseUrl}?${paramsString}`;
    }
  }

  console.log("Loading WebView with URL:", webViewUrl);


  return (
    <main className="relative h-screen">
      <WebView url={webViewUrl} />
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

function HomePageContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  
  const isVerificationFlow = searchParams.has('verification');
  const hasCode = searchParams.has('code');

  // If we've started verification but haven't submitted a code yet, show the verification form.
  if (isVerificationFlow && !hasCode) {
    return <VerificationScreen />;
  }

  // Otherwise (if authenticated, or if verifying with a code), show the main app.
  // The MainApp component has its own logic to handle redirects if not authenticated.
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
