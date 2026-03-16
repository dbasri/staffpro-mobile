
'use client';

import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Service to handle communications with the StaffPro authentication endpoints.
 */
export const AuthApi = {
  /**
   * Fetches the WebAuthn authentication options from the server.
   */
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    
    console.log('DIAGNOSTIC: [AuthApi] Requesting options for:', email);
    
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

      console.log('DIAGNOSTIC: [AuthApi] Server responded with status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText || 'Check server logs'}`);
      }

      // We expect a clean JSON object now.
      const data = await response.json();
      console.log('DIAGNOSTIC: [AuthApi] Received JSON data:', data);
      return data;
    } catch (error) {
      console.error('DIAGNOSTIC ERROR: [AuthApi] Fetch failed:', error);
      throw error;
    }
  },

  /**
   * Sends the signed passkey assertion back to the server for verification.
   */
  async verifyPasskey(assertion: any, email: string, deviceName: string): Promise<UserSession> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

    console.log('DIAGNOSTIC: [AuthApi] Verifying passkey assertion for:', email);

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

      console.log('DIAGNOSTIC: [AuthApi] Verification server responded with status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Verification error (${response.status}): ${errorText || 'Check server logs'}`);
      }

      const data = await response.json();
      console.log('DIAGNOSTIC: [AuthApi] Verification JSON response:', data);
      return data;
    } catch (error) {
      console.error('DIAGNOSTIC ERROR: [AuthApi] Verification failed:', error);
      throw error;
    }
  },
};
