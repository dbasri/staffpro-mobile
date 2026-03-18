'use client';

import { staffproBaseUrl } from './config';
import type { UserSession } from '@/types/session';

/**
 * Surgically extracts the first valid JSON object from a string using brace counting.
 */
function parseFirstJson(text: string) {
  const start = text.indexOf('{');
  if (start === -1) return null;

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
        try {
          const jsonStr = text.substring(start, i + 1);
          return JSON.parse(jsonStr);
        } catch (e) {
          return null;
        }
      }
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

  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;
      
      const json = parseFirstJson(accumulated);
      if (json) {
        console.log('DIAGNOSTIC: [AuthApi] Valid JSON found! Aborting connection.');
        // We found our object! Cancel the reader to stop the server stream.
        await reader.cancel().catch(() => {});
        return json;
      }
    }
    // Fallback if the stream ends without finding a complete object via brace counting
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
