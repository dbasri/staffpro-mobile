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
      // For development, we can be more lenient, but production code should be strict.
      if (event.origin !== "https://mystaffpro.com") {
        console.warn(`Message from untrusted origin ignored: ${event.origin}`);
        return;
      }
      
      // Ensure the data has a status property before processing
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
          // Log out and redirect to login page after a short delay
          setTimeout(() => {
            logout();
          }, 2000);
        }
      } else {
         console.log("Message received from iframe (unstructured):", event.data);
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup function to remove the event listener when the component unmounts.
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [logout, toast, login]);


  // We are in a verification flow if 'verification' is a query param.
  // This is a broader check to prevent premature redirects.
  const isVerifying = searchParams.has('verification');

  useEffect(() => {
    // Only redirect to login if we are NOT authenticated AND we are NOT in the middle
    // of a verification flow. This allows the WebView to load and send the postMessage.
    if (!isLoading && !isAuthenticated && !isVerifying) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router, isVerifying]);


  // Show a loader if we are in the initial loading state OR if we are in the process of
  // verifying but are not yet authenticated.
  if (isLoading || (!isAuthenticated && isVerifying)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }


  const baseUrl = "https://mystaffpro.com/v6/m_mobile";
  let webViewUrl = baseUrl;
  const paramsString = searchParams.toString();
  
  // Only append params if the user is authenticated OR if they are in the verification flow.
  if (isAuthenticated || isVerifying) {
    if (paramsString) {
      webViewUrl = `${baseUrl}?${paramsString}`;
    }
  }

  // To help you debug, we'll log the exact URL being sent to the WebView.
  // You can check this in your browser's developer console.
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


// Next.js Suspense and useSearchParams work together.
// We wrap the component tree in a Suspense boundary.
// https://nextjs.org/docs/app/building-your-application/rendering/client-components#suspense-and-usesearchparams
function HomePageContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const isVerificationFlow = searchParams.get('verification') === 'true';
  const hasSubmittedCode = searchParams.has('code');

  // If it's the verification flow AND a code has been submitted, the user should be logged in.
  // We show the MainApp. The logic inside MainApp will handle the authenticated state.
  if (isVerificationFlow && hasSubmittedCode) {
    return <MainApp />;
  }

  // If it's the verification flow but NO code has been submitted yet, show the verification screen.
  if (isVerificationFlow && !hasSubmittedCode) {
    return <VerificationScreen />;
  }

  // If the user is authenticated through other means (like passkey), show the main app.
  if (isAuthenticated) {
    return <MainApp />;
  }
  
  // By default, if none of the above conditions are met, we can decide what to show.
  // It's safest to show the MainApp and let its internal logic handle redirection if not authenticated.
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
