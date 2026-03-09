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
        throw new Error(`Server error (${response.status}): ${errorText || 'Unknown error'}`);
      }

      return await response.json();
    } catch (error: any) {
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
        throw new Error(`Verification error (${response.status}): ${errorText || 'Unknown error'}`);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error('Network error or CORS block during verification.');
      }
      throw error;
    }
  },
};
