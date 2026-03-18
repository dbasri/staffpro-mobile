'use client';

import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Surgically extracts the first valid JSON object from a string.
 * Handles leading noise (like PHP warnings) and trailing data (like open streams).
 */
function parseFirstJson(text: string) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  // We find the last possible '}' to try and parse the largest possible object.
  // We then work backwards to find the correct closing brace if the server appended noise.
  let end = text.lastIndexOf('}');
  while (end > start) {
    try {
      const jsonStr = text.substring(start, end + 1);
      return JSON.parse(jsonStr);
    } catch (e) {
      // If parsing failed, maybe we found the wrong '}' (e.g. inside a string)
      // Search for the previous '}' and try again.
      end = text.lastIndexOf('}', end - 1);
    }
  }
  return null;
}

/**
 * Fetches JSON from a server that might not close the connection.
 * It reads the stream and returns as soon as a valid JSON object is found.
 */
async function fetchSurgically(url: string, options: RequestInit) {
  console.log(`DIAGNOSTIC: [AuthApi] Fetching: ${url}`);
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Server responded with status ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    const text = await response.text();
    return JSON.parse(text);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        
        const json = parseFirstJson(accumulated);
        if (json) {
          console.log('DIAGNOSTIC: [AuthApi] Valid JSON found! Aborting connection immediately to prevent hang.');
          // Cancel the reader to stop the server stream and prevent the 60s hang
          await reader.cancel('JSON_FOUND').catch(() => {});
          return json;
        }
      }

      if (done) {
        console.log('DIAGNOSTIC: [AuthApi] Stream closed by server.');
        break;
      }
    }
    
    // Fallback if the stream ends without a complete object
    return JSON.parse(accumulated);
  } finally {
    reader.releaseLock();
  }
}

export const AuthApi = {
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    console.log('DIAGNOSTIC: [AuthApi] Requesting options for:', email);
    
    return fetchSurgically(`${staffproBaseUrl}?passkey=options`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, email, deviceName }),
    });
  },

  async verifyPasskey(assertion: any, email: string, deviceName: string): Promise<UserSession> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    console.log('DIAGNOSTIC: [AuthApi] Verifying passkey assertion...');

    return fetchSurgically(`${staffproBaseUrl}?passkey=verify`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assertion, origin, email, deviceName }),
    });
  },
};
