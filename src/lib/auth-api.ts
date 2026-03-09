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
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    console.log(`PASSKEY: Starting options request for ${email}`);
    console.log(`PASSKEY: App Origin is: ${origin}`);
    console.log(`PASSKEY: Requesting from: ${staffproBaseUrl}?passkey=options`);

    try {
      const response = await fetch(`${staffproBaseUrl}?passkey=options`, {
        method: 'POST',
        mode: 'cors', // Explicitly set CORS mode
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
        console.error(`PASSKEY: Server returned error status ${response.status}`);
        console.error(`PASSKEY: Server error body:`, errorText);
        throw new Error(`Server error (${response.status}): ${errorText || 'Check server logs'}`);
      }

      const options = await response.json();
      console.log('PASSKEY: Successfully received options JSON from server:', options);
      
      // DIAGNOSTIC: Check if server sent the right type of options
      if (options.publicKey && options.publicKey.user && options.publicKey.pubKeyCredParams) {
        console.warn('PASSKEY: Server sent CreationOptions (Registration). For Login, it should send RequestOptions (allowCredentials).');
      }

      return options;
    } catch (error: any) {
      console.error('PASSKEY: Fetch operation failed.', error);
      
      // Distinguish between network errors (CORS/Offline) and other errors
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error(`Network error or CORS block. Ensure server at ${staffproBaseUrl} returns 'Access-Control-Allow-Origin: ${origin}' in the POST response.`);
      }
      throw error;
    }
  },

  /**
   * Sends the signed passkey assertion back to the server for verification.
   * Server should respond with: header('Content-Type: application/json'); echo json_encode($userSession); exit;
   */
  async verifyPasskey(assertion: any, email: string, deviceName: string): Promise<UserSession> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    console.log(`PASSKEY: Sending assertion for ${email} to verification endpoint.`);

    try {
      const response = await fetch(`${staffproBaseUrl}?passkey=verify`, {
        method: 'POST',
        mode: 'cors',
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
        console.error(`PASSKEY: Verification endpoint returned error ${response.status}`);
        throw new Error(`Verification error (${response.status}): ${errorText || 'Check server logs'}`);
      }

      const result = await response.json();
      console.log('PASSKEY: Verification result JSON:', result);
      return result;
    } catch (error: any) {
      console.error('PASSKEY: Fetch operation failed during verification.', error);
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error('Network error or CORS block during verification response.');
      }
      throw error;
    }
  },
};
