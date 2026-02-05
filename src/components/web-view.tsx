'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface WebViewProps {
  url: string;
}

export default function WebView({ url }: WebViewProps) {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoad = () => {
    setIsLoading(false);
  };

  return (
    <div className="relative h-screen w-full bg-background">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      )}
      <iframe
        src={url}
        onLoad={handleLoad}
        title="Web Content"
        className="absolute inset-0 h-full w-full border-0"
        sandbox="allow-scripts allow-forms allow-popups"
      />
    </div>
  );
}
