'use client';

import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Surgically extracts the first valid JSON object from a string that may contain 
 * trailing characters, HTML, or multiple JSON objects.
 */
function parseFirstJsonObject(text: string) {
  const start = text.indexOf('{');
  if (start === -1) {
    console.error('DIAGNOSTIC: No JSON object found in response text');
    throw new Error('Invalid server response: No JSON found');
  }
  
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    
    if (depth === 0) {
      const jsonCandidate = text.substring(start, i + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (e) {
        console.error('DIAGNOSTIC: Failed to parse extracted JSON block:', jsonCandidate);
        throw e;
      }
    }
  }
  throw new Error('Invalid server response: Incomplete JSON');
}

export const AuthApi = {
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

      const text = await response.text();
      return parseFirstJsonObject(text);
    } catch (error) {
      console.error('DIAGNOSTIC ERROR: [AuthApi] Fetch options failed:', error);
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

      const text = await response.text();
      return parseFirstJsonObject(text);
    } catch (error) {
      console.error('DIAGNOSTIC ERROR: [AuthApi] Verification failed:', error);
      throw error;
    }
  },
};
