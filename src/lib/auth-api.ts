'use client';

import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Surgically extracts the first valid JSON object from a string.
 * This handles cases where the server appends extra characters, HTML, 
 * or multiple JSON objects by counting braces to find a complete object.
 * This also prevents 60s hangs if the server stream stays open.
 */
function parseDirtyJson(text: string) {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('No JSON object found in response');
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') depth--;
      
      if (depth === 0) {
        const jsonCandidate = text.substring(start, i + 1);
        try {
          return JSON.parse(jsonCandidate);
        } catch (e) {
          console.error('DIAGNOSTIC: Failed to parse extracted block:', jsonCandidate);
          throw e;
        }
      }
    }
  }
  throw new Error('Incomplete JSON object in response');
}

export const AuthApi = {
  /**
   * Fetches the WebAuthn authentication options from the server.
   */
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    
    console.log('DIAGNOSTIC: [AuthApi] Fetching passkey options for:', email);
    
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
      console.log('DIAGNOSTIC: [AuthApi] Options response received. Parsing...');
      return parseDirtyJson(text);
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

    console.log('DIAGNOSTIC: [AuthApi] Verifying passkey with server...');

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
      console.log('DIAGNOSTIC: [AuthApi] Verification response received');
      return parseDirtyJson(text);
    } catch (error) {
      console.error('DIAGNOSTIC ERROR: [AuthApi] Verification failed:', error);
      throw error;
    }
  },
};
