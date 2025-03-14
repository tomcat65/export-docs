'use client';

import useSWR, { KeyedMutator } from 'swr';
import { createCacheKey, createSwrConfig } from './swr-config';
import { Document } from '@/models/Document';

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
  const config = createSwrConfig();

  const cacheKey = clientId 
    ? createCacheKey(DOCUMENTS_NAMESPACE, `client:${clientId}:documents`) 
    : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<{ documents: Document[] }>(
    cacheKey,
    async () => {
      if (!clientId) return { documents: [] };
      
      // Add a timestamp to prevent browser caching
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/clients/${clientId}/documents?t=${timestamp}`);
      if (!response.ok) {
        throw new Error('Failed to fetch client documents');
      }
      
      return response.json();
    },
    config
  );

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
 */
export function mutateAllDocuments(): void {
  // This implementation depends on how SWR cache is being accessed globally
  // For now, we're using window events to trigger revalidation across tabs
  window.dispatchEvent(new CustomEvent('mutate-documents'));
}

/**
 * Setup a listener for document mutations across tabs
 * This function should be called once at the application root
 */
export function setupDocumentsMutationListener(mutateDocuments: KeyedMutator<any>): () => void {
  const handler = () => {
    mutateDocuments();
  };
  
  window.addEventListener('mutate-documents', handler);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('mutate-documents', handler);
  };
} 