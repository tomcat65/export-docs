'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentList } from '@/components/document-list';
import { useRouter } from 'next/navigation';
import { useClientDocuments } from '@/hooks/swr/use-documents';
import { useDocumentMutations } from '@/hooks/swr/use-document-mutations';
import { Document } from '@/models/Document';

// Define the client interface
interface SerializedClient {
  id: string;
  name: string;
  rif: string;
}

// Ensure Document type has the properties we need
interface DocumentWithProps extends Document {
  _id: string;
  fileName: string;
}

export function ClientDocumentsWrapperSwr({ 
  initialClient 
}: { 
  initialClient: SerializedClient 
}) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);

  // Use our SWR hook to fetch and manage documents
  const { documents, isLoading, error, mutate } = useClientDocuments(client.id);
  
  // Use our document mutations hook for operations
  const { 
    uploadDocument, 
    deleteDocument, 
    regenerateDocument,
    isLoading: isMutating,
    error: mutationError 
  } = useDocumentMutations();

  // Update client when initialClient changes
  useEffect(() => {
    setClient(initialClient);
  }, [initialClient]);

  // Refresh documents
  const refreshDocuments = () => {
    mutate();
  };

  // Display any errors
  const displayError = error || mutationError;
  
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='flex items-center gap-2 sm:gap-4'>
            <Link href='/dashboard/clients'>
              <Button variant='outline' size='icon' className="h-8 w-8 sm:h-10 sm:w-10">
                <ArrowLeft className='h-3 w-3 sm:h-4 sm:w-4' />
              </Button>
            </Link>
            <div>
              <h1 className='text-xl sm:text-2xl md:text-3xl font-bold truncate'>{client.name}</h1>
              <p className='text-xs sm:text-sm text-muted-foreground'>RIF: {client.rif}</p>
            </div>
          </div>
        </div>
      </div>

      {displayError && (
        <div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg">
          {displayError}
        </div>
      )}

      <DocumentList 
        clientId={client.id} 
        documents={documents as any[]}
        onDocumentDeleted={refreshDocuments}
      />

      {isLoading && (
        <div className="flex justify-center p-4">
          <div className="animate-spin h-6 w-6 border-t-2 border-blue-500 rounded-full"></div>
        </div>
      )}
    </div>
  );
} 