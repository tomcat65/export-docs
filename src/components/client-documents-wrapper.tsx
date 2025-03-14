'use client'

import Link from 'next/link'
import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DocumentList } from '@/components/document-list'
import { ArrowLeft } from 'lucide-react'
import { useClientDocuments } from '@/hooks/swr/use-documents'
import { useDocumentMutations } from '@/hooks/swr/use-document-mutations'
import { mutateAllDocuments, setupDocumentsMutationListener } from '@/hooks/swr/use-documents'
import { Document } from '@/models/Document'

// Define the client interface
interface SerializedClient {
  id: string
  name: string
  rif: string
  documents: any[] // Initial documents from server
}

// Define the document interface
interface SerializedDocument {
  _id: string
  fileName: string
  [key: string]: any
}

// Client component wrapper for document list
export function ClientDocumentsWrapper({ 
  initialClient 
}: { 
  initialClient: SerializedClient 
}) {
  const router = useRouter()
  const [client, setClient] = useState(initialClient)
  
  // Use our SWR hook to fetch and manage documents
  // Note: We initialize with initialClient.documents so there's no initial loading state
  const { documents, isLoading, error, mutate } = useClientDocuments(client.id)
  
  // Use our document mutations hook for operations
  const { 
    deleteDocument, 
    regenerateDocument,
    isLoading: isMutating,
    error: mutationError 
  } = useDocumentMutations()

  // Update client when initialClient changes
  useEffect(() => {
    setClient(initialClient)
  }, [initialClient])

  // Set up document mutation listener for cross-tab communication
  useEffect(() => {
    if (client.id) {
      // Set up listener that will trigger revalidation when mutations happen
      const cleanup = setupDocumentsMutationListener(mutate);
      
      return () => {
        cleanup(); // Clean up listener when component unmounts or clientId changes
      };
    }
  }, [client.id, mutate])

  // Refresh documents by triggering a mutation
  const refreshDocuments = async () => {
    mutate()
    
    // Also notify other tabs/windows of the change
    mutateAllDocuments(client.id)
  }

  // Handle document deletion
  const handleDelete = async (document: any) => {
    if (window.confirm(`Are you sure you want to delete ${document.fileName}?`)) {
      const success = await deleteDocument(document._id)
      if (success) {
        refreshDocuments()
      }
    }
  }

  // Handle document regeneration
  const handleRegenerate = async (document: any) => {
    const regenerated = await regenerateDocument(document._id)
    if (regenerated) {
      refreshDocuments()
    }
  }

  // Display any errors
  const displayError = error || mutationError
  
  // Use the initial documents if SWR hasn't loaded yet, otherwise use the SWR data
  const displayDocuments = isLoading ? initialClient.documents : (documents.length > 0 ? documents : initialClient.documents)
  
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
        documents={displayDocuments as any[]}
        onDocumentDeleted={refreshDocuments}
      />

      {(isLoading || isMutating) && (
        <div className="flex justify-center p-4">
          <div className="animate-spin h-6 w-6 border-t-2 border-blue-500 rounded-full"></div>
        </div>
      )}
    </div>
  )
} 