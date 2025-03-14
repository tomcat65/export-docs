'use client';

import { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { swrConfig } from './swr-config';

interface SwrProviderProps {
  children: ReactNode;
}

/**
 * SWR Provider component to wrap the application with global SWR configuration
 * This ensures consistent data fetching behavior across the app
 */
export function SwrProvider({ children }: SwrProviderProps) {
  return (
    <SWRConfig value={swrConfig}>
      {children}
    </SWRConfig>
  );
} 