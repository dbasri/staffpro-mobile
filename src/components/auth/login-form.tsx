'use client';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { KeyRound, ShieldCheck } from 'lucide-react';

export function LoginForm() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 pt-6">
        <Button variant="outline" className="w-full">
          <KeyRound className="mr-2" />
          Sign in with a passkey
        </Button>
        <Button variant="outline" className="w-full">
          <ShieldCheck className="mr-2" />
          Use a verification code
        </Button>
      </div>
    </div>
  );
}
