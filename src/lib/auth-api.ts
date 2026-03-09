import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle direct POST communications with the StaffPro authentication endpoints.
 * These methods use the fetch API and expect raw JSON responses from the server.
 */
export const AuthApi = {
  /**
   * Fetches the WebAuthn authentication options (challenge) from the server.
   * Server should respond with: header('Content-Type: application/json'); echo json_encode($options); exit;
   */
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    try {
      console.log(`PASSKEY: Requesting options for ${email} from ${staffproBaseUrl}?passkey=options`);
      const response = await fetch(`${staffproBaseUrl}?passkey=options`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          origin: window.location.origin,
          email: email,
          deviceName: deviceName
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PASSKEY: Server returned error ${response.status}:`, errorText);
        throw new Error(`Server error (${response.status}): ${errorText || 'Unknown error'}`);
      }

      const options = await response.json();
      console.log('PASSKEY: Received options JSON:', options);
      return options;
    } catch (error: any) {
      console.error('PASSKEY: Fetch error in getPasskeyOptions:', error);
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error('Network error or CORS block. Please check server headers.');
      }
      throw error;
    }
  },

  /**
   * Sends the signed passkey assertion back to the server for verification.
   * Server should respond with: header('Content-Type: application/json'); echo json_encode($userSession); exit;
   */
  async verifyPasskey(assertion: any, email: string, deviceName: string): Promise<UserSession> {
    try {
      console.log(`PASSKEY: Verifying assertion for ${email} at ${staffproBaseUrl}?passkey=verify`);
      const response = await fetch(`${staffproBaseUrl}?passkey=verify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          assertion,
          origin: window.location.origin,
          email: email,
          deviceName: deviceName
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PASSKEY: Verification server error ${response.status}:`, errorText);
        throw new Error(`Verification error (${response.status}): ${errorText || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('PASSKEY: Verification result:', result);
      return result;
    } catch (error: any) {
      console.error('PASSKEY: Fetch error in verifyPasskey:', error);
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error('Network error or CORS block during verification.');
      }
      throw error;
    }
  },
};
