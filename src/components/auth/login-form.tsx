'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { KeyRound, ShieldCheck, Mail } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const VerificationSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
});

type VerificationFormValues = z.infer<typeof VerificationSchema>;

const EMAIL_STORAGE_KEY = 'staffpro-verification-email';

export function LoginForm() {
  const { passkeyLogin } = useAuth();
  const router = useRouter();
  const [showVerificationForm, setShowVerificationForm] = useState(false);

  const form = useForm<VerificationFormValues>({
    resolver: zodResolver(VerificationSchema),
    defaultValues: {
      email: '',
    },
  });

  // Use an effect to set the email from localStorage when the form is shown
  useEffect(() => {
    if (showVerificationForm) {
      try {
        const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY) || '';
        form.reset({ email: storedEmail }); // Use reset for more robust update
      } catch (error) {
        console.error('Could not access local storage for email:', error);
      }
    }
  }, [showVerificationForm, form]);

  const handleLogin = async () => {
    await passkeyLogin();
    router.push('/');
  };

  const handleVerificationSubmit = (data: VerificationFormValues) => {
    try {
      // Save the email to localStorage for persistence
      localStorage.setItem(EMAIL_STORAGE_KEY, data.email);
    } catch (error) {
      console.error('Could not access local storage to save email:', error);
    }
    // Navigate to start the verification process
    router.push(`/?verification=true&email=${encodeURIComponent(data.email)}`);
  };

  if (showVerificationForm) {
    return (
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleVerificationSubmit)}
          className="space-y-4 pt-6"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="you@example.com"
                      {...field}
                      className="pl-10"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="space-y-2">
            <Button type="submit" className="w-full">
              Send Verification Code
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowVerificationForm(false)}
            >
              Back to login options
            </Button>
          </div>
        </form>
      </Form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 pt-6">
        <Button variant="outline" className="w-full" onClick={handleLogin}>
          <KeyRound className="mr-2" />
          Sign in with a passkey
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowVerificationForm(true)}
        >
          <ShieldCheck className="mr-2" />
          Use a verification code
        </Button>
      </div>
    </div>
  );
}
