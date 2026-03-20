'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { KeyRound, ShieldCheck, Mail, Loader2 } from 'lucide-react';

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
  const [loginMethod, setLoginMethod] = useState<'passkey' | 'code' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VerificationFormValues>({
    resolver: zodResolver(VerificationSchema),
    defaultValues: {
      email: '',
    },
  });

  useEffect(() => {
    if (loginMethod) {
      try {
        const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY) || '';
        form.reset({ email: storedEmail });
      } catch (error) {
        console.error('Could not access local storage for email:', error);
      }
    }
  }, [loginMethod, form]);

  const handleLoginSubmit = async (data: VerificationFormValues) => {
    setIsSubmitting(true);
    try {
      localStorage.setItem(EMAIL_STORAGE_KEY, data.email);
      
      if (loginMethod === 'passkey') {
        // Redirection is handled inside passkeyLogin in the Provider
        await passkeyLogin(data.email);
      } else if (loginMethod === 'code') {
        router.push(`/?verification=true&email=${encodeURIComponent(data.email)}`);
      }
    } catch (error) {
      console.error('Login form error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loginMethod) {
    return (
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleLoginSubmit)}
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
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              type="button"
              onClick={() => setLoginMethod(null)}
              disabled={isSubmitting}
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
        <Button variant="outline" className="w-full" onClick={() => setLoginMethod('passkey')}>
          <KeyRound className="mr-2" />
          Sign in with a passkey
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setLoginMethod('code')}
        >
          <ShieldCheck className="mr-2" />
          Use a verification code
        </Button>
      </div>
    </div>
  );
}
