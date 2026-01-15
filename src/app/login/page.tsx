import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FlameKindling } from 'lucide-react';

export default function LoginPage() {
  const bgImage = PlaceHolderImages.find((img) => img.id === 'login-background');

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background p-4">
      {bgImage && (
        <Image
          src={bgImage.imageUrl}
          alt={bgImage.description}
          fill
          className="object-cover opacity-10"
          data-ai-hint={bgImage.imageHint}
          priority
        />
      )}
      <div className="relative z-10 w-full max-w-md">
         <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <FlameKindling className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">StaffPro Mobile</CardTitle>
            <CardDescription>Access must be enabled by a StaffPro Administrator.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
