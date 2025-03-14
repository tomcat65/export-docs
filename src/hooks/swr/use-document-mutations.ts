'use client';

import { useState } from 'react';
import { mutateAllDocuments } from './use-documents';
import { Document } from '@/models/Document';

interface DocumentMutationHookResult {
  uploadDocument: (clientId: string, file: File) => Promise<Document | null>;
  deleteDocument: (documentId: string) => Promise<boolean>;
  regenerateDocument: (documentId: string) => Promise<Document | null>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for document mutation operations that trigger SWR revalidation
 * @returns Object with document mutation functions and loading/error states
 */
export function useDocumentMutations(): DocumentMutationHookResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Upload a new document and trigger revalidation
   * @param clientId - The client ID to associate with the document
   * @param file - The file to upload
   * @returns The uploaded document or null if failed
   */
  const uploadDocument = async (clientId: string, file: File): Promise<Document | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // First, try to extract BOL number from the file name
      const bolNumberMatch = file.name.match(/(\d{9})/)?.[1]; // Assuming BOL numbers are 9 digits
      if (!bolNumberMatch) {
        throw new Error('Could not find BOL number in filename. Expected format: MDRA0101_123456789.pdf');
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientId', clientId);
      
      // First, validate the BOL number and format
      const validateResponse = await fetch('/api/documents/validate-bol', {
        method: 'POST',
        body: formData
      });

      if (!validateResponse.ok) {
        const error = await validateResponse.json();
        throw new Error(error.error || 'Failed to validate BOL');
      }

      // If validation passed, upload the file and process with Claude
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('clientId', clientId);
      uploadFormData.append('bolNumber', bolNumberMatch);

      const uploadResponse = await fetch('/api/documents/upload', {
        method: 'POST',
        body: uploadFormData
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || 'Failed to upload BOL');
      }

      const result = await uploadResponse.json();
      
      // Trigger revalidation across all windows
      mutateAllDocuments(clientId);
      
      return result.document;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload document';
      setError(errorMessage);
      console.error('Error uploading document:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete a document and trigger revalidation
   * @param documentId - The ID of the document to delete
   * @returns True if successful, false otherwise
   */
  const deleteDocument = async (documentId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete document');
      }

      // Trigger revalidation across all windows
      mutateAllDocuments();
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
      setError(errorMessage);
      console.error('Error deleting document:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Regenerate a document and trigger revalidation
   * @param documentId - The ID of the document to regenerate
   * @returns The regenerated document or null if failed
   */
  const regenerateDocument = async (documentId: string): Promise<Document | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/regenerate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to regenerate document');
      }

      const result = await response.json();
      
      // Trigger revalidation across all windows
      mutateAllDocuments();
      
      return result.document;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate document';
      setError(errorMessage);
      console.error('Error regenerating document:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    uploadDocument,
    deleteDocument,
    regenerateDocument,
    isLoading,
    error
  };
} 