'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface WebViewProps {
  url: string;
}

function WebView({ url }: WebViewProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Reset loading state when the URL changes to ensure loader shows during transitions
  useEffect(() => {
    if (url) {
      setIsLoading(true);
    }
  }, [url]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  return (
    <div className="relative h-dvh w-full bg-background overflow-hidden">
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
        allow="camera; microphone; geolocation; publickey-credentials-create; publickey-credentials-get; clipboard-write; display-capture"
      />
    </div>
  );
}

export default WebView;