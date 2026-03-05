
import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle direct POST communications with the StaffPro authentication endpoints.
 */
export const AuthApi = {
  /**
   * Fetches the WebAuthn authentication options (challenge) from the server.
   */
  async getPasskeyOptions(): Promise<any> {
    const response = await fetch(`${staffproBaseUrl}?passkey=options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: window.location.origin }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch passkey options from server.');
    }

    return response.json();
  },

  /**
   * Sends the signed passkey assertion back to the server for verification.
   */
  async verifyPasskey(assertion: any): Promise<UserSession> {
    const response = await fetch(`${staffproBaseUrl}?passkey=verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assertion,
        origin: window.location.origin,
      }),
    });

    if (!response.ok) {
      throw new Error('Passkey verification failed on server.');
    }

    return response.json();
  },
};
