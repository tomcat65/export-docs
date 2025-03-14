import { SWRConfiguration } from 'swr';

/**
 * Global SWR configuration options
 * - refreshInterval: Set to 0 to disable automatic polling (only refresh on focus/reconnect)
 * - revalidateOnFocus: Revalidate when the browser regains focus
 * - revalidateOnReconnect: Revalidate when the browser regains internet connection
 * - dedupingInterval: Dedupe requests with the same key in this time span
 */
export const swrConfig: SWRConfiguration = {
  refreshInterval: 0, // Disable automatic polling to reduce server load
  revalidateOnFocus: true, // Refresh when window gets focus
  revalidateOnReconnect: true, // Refresh when reconnecting
  dedupingInterval: 2000, // Debounce time for duplicate requests
  onError: (error) => {
    console.error('SWR Global Error:', error);
  }
};

/**
 * Create a custom SWR configuration with different parameters
 * @param config - Custom SWR configuration to merge with defaults
 * @returns merged SWR configuration
 */
export function createSwrConfig(config: Partial<SWRConfiguration> = {}): SWRConfiguration {
  return {
    ...swrConfig,
    ...config,
  };
}

/**
 * Create a custom cache key format that includes a namespace
 * @param namespace - The namespace for the cache key
 * @param key - The specific key
 * @returns Namespaced cache key
 */
export function createCacheKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
} 