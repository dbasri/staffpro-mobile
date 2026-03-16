import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle direct POST communications with the StaffPro authentication endpoints.
 * Includes a resilient parser to handle concatenated JSON objects or trailing server warnings.
 */
export const AuthApi = {
  /**
   * Resiliently extracts and parses the FIRST valid JSON object from a potentially "dirty" 
   * or concatenated response string.
   */
  async parseDirtyJson(response: Response): Promise<any> {
    const text = await response.text();
    try {
      // Find the first opening brace
      const firstBrace = text.indexOf('{');
      if (firstBrace === -1) {
        throw new Error("No opening brace found in response.");
      }

      // Brace counting to find the end of the FIRST complete object
      let braceCount = 0;
      let lastBrace = -1;
      for (let i = firstBrace; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') braceCount--;
        
        if (braceCount === 0) {
          lastBrace = i;
          break;
        }
      }

      if (lastBrace === -1) {
        throw new Error("Could not find a balanced closing brace.");
      }

      const cleanJson = text.substring(firstBrace, lastBrace + 1);
      return JSON.parse(cleanJson);
    } catch (e: any) {
      console.error('AUTH: Failed to parse server response:', text);
      throw new Error(`JSON Parse Error: ${e.message}. See console for raw response.`);
    }
  },

  /**
   * Fetches the WebAuthn authentication options from the server.
   */
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    
    try {
      const response = await fetch(`${staffproBaseUrl}?passkey=options`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
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

      // If the server sends multiple objects, parseDirtyJson extracts the first one.
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

      return await this.parseDirtyJson(response);
    } catch (error: any) {
      console.error('PASSKEY: Verification fetch failed.', error);
      throw error;
    }
  },
};
