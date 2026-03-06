'use client';

import useSWR, { KeyedMutator } from 'swr';
import { createCacheKey, createSwrConfig } from './swr-config';
import { Document } from '@/models/Document';
import { useEffect } from 'react';

const DOCUMENTS_NAMESPACE = 'documents';

/**
 * Fetch a single document by ID using SWR
 * @param documentId - The ID of the document to fetch
 * @returns Document data, loading state, error, and mutate function
 */
export function useDocument(documentId: string | null) {
  const config = createSwrConfig({
    revalidateIfStale: true
  });

  const cacheKey = documentId 
    ? createCacheKey(DOCUMENTS_NAMESPACE, `document:${documentId}`) 
    : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<{ document: Document }>(
    cacheKey,
    async () => {
      if (!documentId) return { document: null };
      
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }
      
      return response.json();
    },
    config
  );

  return {
    document: data?.document,
    isLoading,
    isValidating,
    error,
    mutate
  };
}

/**
 * Fetch all documents for a client using SWR
 * @param clientId - The ID of the client
 * @returns Documents array, loading state, error, and mutate function
 */
export function useClientDocuments(clientId: string | null) {
  const config = createSwrConfig({
    revalidateOnFocus: true,
    revalidateIfStale: true,
    dedupingInterval: 2000, // Lower to 2 seconds to reduce stale data risk
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  const cacheKey = clientId 
    ? createCacheKey(DOCUMENTS_NAMESPACE, `client:${clientId}:documents`) 
    : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<{ documents: Document[] }>(
    cacheKey,
    async () => {
      if (!clientId) return { documents: [] };
      
      // Add a timestamp to prevent browser caching
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/clients/${clientId}/documents?t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch client documents: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch client documents: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`SWR fetch returned ${result.documents?.length || 0} documents`);
      
      // Validate documents array
      if (!result.documents || !Array.isArray(result.documents)) {
        console.error('API returned invalid documents format:', result);
        throw new Error('API returned invalid documents data');
      }
      
      return result;
    },
    config
  );

  // Log document data for debugging
  console.log('SWR documents data:', {
    hasData: !!data,
    count: data?.documents?.length || 0,
    loading: isLoading,
    error: error?.message
  });

  // Force revalidation if there's an error or no data
  useEffect(() => {
    if ((error || (data && data.documents && data.documents.length === 0)) && clientId) {
      console.log('Triggering revalidation due to error or empty documents');
      mutate();
    }
  }, [error, data, clientId, mutate]);

  return {
    documents: data?.documents || [],
    isLoading,
    isValidating,
    error,
    mutate
  };
}

/**
 * Helper function to mutate all document-related cache entries
 * This is useful when a document is created, updated, or deleted
 * @param clientId - Optional client ID to include in the event detail
 */
export function mutateAllDocuments(clientId?: string): void {
  // Use localStorage to help with cross-tab communication
  // The timestamp serves as a unique identifier for this mutation event
  const timestamp = new Date().getTime();
  try {
    // Save the mutation event in localStorage
    localStorage.setItem('document-mutation', JSON.stringify({
      timestamp,
      clientId,
    }));
    
    // Dispatch an event for the current window
    window.dispatchEvent(new CustomEvent('mutate-documents', {
      detail: { timestamp, clientId }
    }));
    
    console.log(`Dispatched document mutation event at ${timestamp}`);
  } catch (error) {
    console.error('Error triggering document mutation:', error);
  }
}

/**
 * Setup a listener for document mutations across tabs
 * This function should be called once at the application root
 * @param mutateDocuments - The SWR mutate function to call when a mutation is detected
 */
export function setupDocumentsMutationListener(mutateDocuments: KeyedMutator<any>): () => void {
  // Handler for storage events (cross-tab communication)
  const storageHandler = (event: StorageEvent) => {
    if (event.key === 'document-mutation' && event.newValue) {
      try {
        const data = JSON.parse(event.newValue);
        console.log('Received cross-tab document mutation:', data);
        mutateDocuments();
      } catch (error) {
        console.error('Error handling storage event:', error);
      }
    }
  };
  
  // Handler for custom events (same-tab communication)
  const eventHandler = () => {
    console.log('Received same-window document mutation');
    mutateDocuments();
  };
  
  // Add event listeners
  window.addEventListener('mutate-documents', eventHandler);
  window.addEventListener('storage', storageHandler);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('mutate-documents', eventHandler);
    window.removeEventListener('storage', storageHandler);
  };
} 