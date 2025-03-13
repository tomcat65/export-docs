/**
 * API utility functions for making fetch requests with proper URL handling
 */

/**
 * Constructs an absolute URL for API requests, which is required for server-side fetch calls
 * 
 * @param path - The relative path (e.g., '/api/documents/123')
 * @returns The absolute URL
 */
export function getApiUrl(path: string): string {
  // First, remove any leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Get the base URL from environment variables
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  // Return the complete URL
  return `${baseUrl}/${cleanPath}`;
}

/**
 * Makes a fetch request with an absolute URL, which works in both client and server environments
 * 
 * @param path - The API endpoint path (e.g., '/api/documents/123')
 * @param options - Fetch options
 * @returns The fetch response
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';
  
  // In browser, we can use relative URLs
  // In server, we must use absolute URLs
  const url = isBrowser ? path : getApiUrl(path);
  
  return fetch(url, options);
} 