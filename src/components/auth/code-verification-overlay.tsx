
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { MailCheck, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

const CodeVerificationSchema = z.object({
  code: z.string().min(1, { message: 'Please enter the code.' }),
});

type CodeVerificationFormValues = z.infer<typeof CodeVerificationSchema>;

export default function CodeVerificationOverlay({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const router = useRouter();

  const form = useForm<CodeVerificationFormValues>({
    resolver: zodResolver(CodeVerificationSchema),
    defaultValues: { code: '' },
  });

  const handleVerifySubmit = (data: CodeVerificationFormValues) => {
    // DIAGNOSTIC: Fire a fake postMessage to test the listener
    console.log('--- FIRING INTERNAL TEST postMessage ---');
    const testPayload = {
      status: 'success',
      email: 'test@internal.com',
      session: 'internal-test-session',
      purpose: 'Internal Diagnostic Test',
    };
    window.postMessage(JSON.stringify(testPayload), '*');

    // This submits the code to the iframe by reloading it.
    // The server-side script in the iframe will then post a message back to the app.
    const webview = document.querySelector('iframe');
    if (webview && webview.contentWindow) {
      const baseUrl = "https://mystaffpro.com/v6/m_mobile";
      const params = new URLSearchParams({
        verification: 'true',
        email: email,
        code: data.code,
      });
      webview.src = `${baseUrl}?${params.toString()}`;
    }
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
                <Button onClick={onBack} variant="outline" className="w-full" type="button">
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
