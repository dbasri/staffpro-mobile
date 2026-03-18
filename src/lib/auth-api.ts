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

  let end = text.lastIndexOf('}');
  while (end > start) {
    try {
      const jsonStr = text.substring(start, end + 1);
      const parsed = JSON.parse(jsonStr);
      // Ensure it's a complete object by checking for a status or purpose field commonly used in this app
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      end = text.lastIndexOf('}', end - 1);
    } catch (e) {
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
          console.log('DIAGNOSTIC: [AuthApi] Valid JSON found! Aborting connection immediately to prevent 60s hang.');
          // CRITICAL: Cancel the reader to stop the browser from waiting for the server to close the stream.
          await reader.cancel('JSON_FOUND').catch(() => {});
          return json;
        }
      }

      if (done) break;
    }
    
    // Fallback to standard parse if the stream actually finishes
    return JSON.parse(accumulated);
  } finally {
    reader.releaseLock();
  }
}

export const AuthApi = {
  async getPasskeyOptions(email: string, deviceName: string): Promise<any> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
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
    return fetchSurgically(`${staffproBaseUrl}?passkey=verify`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assertion, origin, email, deviceName }),
    });
  },
};
