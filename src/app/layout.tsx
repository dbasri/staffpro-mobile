import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/providers/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'StaffPro Mobile',
  description: 'Secure Content Environment',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F5A623" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={cn('font-body antialiased', 'bg-background text-foreground')}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('message', (event) => {
                console.log('--- GLOBAL MESSAGE LISTENER ---');
                console.log('Global listener received origin:', event.origin);
                console.log('Global listener received data:', event.data);
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
