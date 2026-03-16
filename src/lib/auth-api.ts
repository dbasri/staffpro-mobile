'use client';

import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle direct POST communications with the StaffPro authentication endpoints.
 * Includes a resilient parser to handle concatenated JSON objects or trailing server warnings.
 */
export const AuthApi = {
  /**
   * Resiliently extracts and parses the FIRST valid JSON object from a potentially "dirty" 
   * or concatenated response string. This prevents hangs when servers output multiple objects.
   */
  async parseDirtyJson(text: string): Promise<any> {
    try {
      // Find the first opening brace
      const firstBrace = text.indexOf('{');
      if (firstBrace === -1) {
        throw new Error("No JSON object found in response.");
      }

      // Brace counting to find the end of the FIRST complete object
      let braceCount = 0;
      let lastBrace = -1;
      for (let i = firstBrace; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') braceCount--;
        
        if (braceCount === 0 && i > firstBrace) {
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
      console.warn('AUTH: Raw response was not valid JSON or contained extra data:', text.substring(0, 100) + '...');
      throw e;
    }
  },

  /**
   * Fetches the WebAuthn authentication options from the server.
   */
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    
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

    const text = await response.text();
    return await this.parseDirtyJson(text);
  },

  /**
   * Sends the signed passkey assertion back to the server for verification.
   */
  async verifyPasskey(assertion: any, email: string, deviceName: string): Promise<UserSession> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

    const response = await fetch(`${staffproBaseUrl}?passkey=verify`, {
      method: 'POST',
      mode: 'cors',
      redirect: 'manual', 
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

    // Handle 302 Redirect as a potential success signal
    if (response.type === 'opaqueredirect' || response.status === 302) {
      return {
        status: 'success',
        email: email,
        name: email.split('@')[0],
        session: 'active',
        purpose: 'authenticated'
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Verification error (${response.status}): ${errorText || 'Check server logs'}`);
    }

    const text = await response.text();
    return await this.parseDirtyJson(text);
  },
};
