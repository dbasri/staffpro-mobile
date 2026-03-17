'use client';

import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Surgically extracts the first valid JSON object from a string that may contain 
 * concatenated data, trailing junk, or multiple JSON objects.
 */
async function parseFirstJsonObject(text: string) {
  try {
    // Attempt standard parse first
    return JSON.parse(text);
  } catch (e) {
    let depth = 0;
    let firstBrace = text.indexOf('{');
    if (firstBrace === -1) {
      console.error('DIAGNOSTIC: No JSON object found in response text');
      throw e;
    }
    
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      
      if (depth === 0) {
        const jsonCandidate = text.substring(firstBrace, i + 1);
        try {
          return JSON.parse(jsonCandidate);
        } catch (innerError) {
          console.error('DIAGNOSTIC: Failed to parse extracted JSON block:', jsonCandidate);
          throw innerError;
        }
      }
    }
    throw e;
  }
}

/**
 * Service to handle communications with the StaffPro authentication endpoints.
 */
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      const text = await response.text();
      return await parseFirstJsonObject(text);
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Verification error (${response.status}): ${errorText}`);
      }

      const text = await response.text();
      return await parseFirstJsonObject(text);
    } catch (error) {
      console.error('DIAGNOSTIC ERROR: [AuthApi] Verification failed:', error);
      throw error;
    }
  },
};
