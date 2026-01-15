'use client';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    await login();
    router.push('/');
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 pt-6">
        <Button variant="outline" className="w-full" onClick={handleLogin}>
          <KeyRound className="mr-2" />
          Sign in with a passkey
        </Button>
        <Button variant="outline" className="w-full" onClick={handleLogin}>
          <ShieldCheck className="mr-2" />
          Use a verification code
        </Button>
      </div>
    </div>
  );
}
