
import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle direct POST communications with the StaffPro authentication endpoints.
 */
export const AuthApi = {
  /**
   * Fetches the WebAuthn authentication options (challenge) from the server.
   * Your server should handle POST at ?passkey=options
   */
  async getPasskeyOptions(): Promise<any> {
    const response = await fetch(`${staffproBaseUrl}?passkey=options`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ origin: window.location.origin }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch passkey options: ${errorText}`);
    }

    return response.json();
  },

  /**
   * Sends the signed passkey assertion back to the server for verification.
   * Your server should handle POST at ?passkey=verify
   */
  async verifyPasskey(assertion: any): Promise<UserSession> {
    const response = await fetch(`${staffproBaseUrl}?passkey=verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        assertion,
        origin: window.location.origin,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Passkey verification failed: ${errorText}`);
    }

    return response.json();
  },
};
