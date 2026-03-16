import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle direct POST communications with the StaffPro authentication endpoints.
 * Includes a resilient JSON parser to handle PHP servers that may output trailing warnings or characters.
 */
export const AuthApi = {
  /**
   * Helper to extract and parse the first valid JSON object from a potentially "dirty" response string.
   */
  async parseDirtyJson(response: Response): Promise<any> {
    const text = await response.text();
    try {
      // Find the first instance of a JSON object/array in the string
      const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in server response.");
      }
      return JSON.parse(jsonMatch[0]);
    } catch (e: any) {
      console.error('AUTH: Failed to parse server response:', text);
      throw new Error(`JSON Parse Error: ${e.message}. See console for raw response.`);
    }
  },

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

      return await this.parseDirtyJson(response);
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
        credentials: 'include', // Ensures PHPSESSID is sent back
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

      return await this.parseDirtyJson(response);
    } catch (error: any) {
      console.error('PASSKEY: Verification fetch failed.', error);
      throw error;
    }
  },
};
