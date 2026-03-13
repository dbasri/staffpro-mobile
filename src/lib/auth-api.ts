import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle direct POST communications with the StaffPro authentication endpoints.
 */
export const AuthApi = {
  /**
   * Fetches the WebAuthn authentication options (challenge) from the server.
   */
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    
    try {
      const response = await fetch(`${staffproBaseUrl}?passkey=options`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include', // Essential for PHP session persistence
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          origin: origin,
          email: email,
          deviceName: deviceName
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText || 'Check server logs'}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('PASSKEY: Options fetch failed.', error);
      throw error;
    }
  },

  /**
   * Sends the signed passkey assertion back to the server for verification.
   */
  async verifyPasskey(assertion: any, email: string, deviceName: string): Promise<UserSession> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

    try {
      const response = await fetch(`${staffproBaseUrl}?passkey=verify`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          assertion,
          origin: origin,
          email: email,
          deviceName: deviceName
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Verification error (${response.status}): ${errorText || 'Check server logs'}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('PASSKEY: Verification fetch failed.', error);
      throw error;
    }
  },
};
