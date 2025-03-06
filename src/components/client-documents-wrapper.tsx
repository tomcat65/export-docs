'use client'

import Link from 'next/link'
import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DocumentList } from '@/components/document-list'
import { ArrowLeft } from 'lucide-react'

// This interface should match what DocumentList expects
interface SerializedDocument {
  _id: string
  clientId: string
  fileName: string
  fileId: string
  type: 'BOL' | 'PL' | 'COO'
  relatedBolId?: string
  createdAt: string
  updatedAt: string
  bolData?: {
    bolNumber: string
    bookingNumber?: string
    shipper?: string
    carrierReference?: string
    vessel?: string
    voyage?: string
    portOfLoading?: string
    portOfDischarge?: string
    dateOfIssue?: string
    totalContainers?: string
    totalWeight?: {
      kg: string
      lbs: string
    }
  }
  packingListData?: {
    documentNumber: string
    date: string
    address: {
      company: string
      street: string
      details: string
      location: string
      country: string
    }
  }
  items?: Array<{
    itemNumber: number
    containerNumber: string
    seal: string
    description: string
    quantity: {
      litros: string
      kg: string
    }
  }>
}

interface SerializedClient {
  id: string
  name: string
  rif: string
  documents: SerializedDocument[]
}

// Client component wrapper for document list
export function ClientDocumentsWrapper({ 
  initialClient 
}: { 
  initialClient: SerializedClient 
}) {
  const router = useRouter()
  const [client, setClient] = useState<SerializedClient>(initialClient)
  
  // Convert serialized documents to proper format
  const convertToDocumentFormat = (docs: SerializedDocument[]) => {
    return docs.map(doc => ({
      ...doc,
      bolData: doc.bolData ? {
        ...doc.bolData,
        totalWeight: doc.bolData.totalWeight ? {
          kg: parseFloat(doc.bolData.totalWeight.kg),
          lbs: parseFloat(doc.bolData.totalWeight.lbs)
        } : undefined
      } : undefined
    }));
  };

  // Function to refresh documents without a full page refresh
  const refreshDocuments = useCallback(async () => {
    try {
      // Set a flag in sessionStorage to indicate that we're refreshing
      // and the DocumentList component should preserve its expanded state
      sessionStorage.setItem('preserveDocumentListState', 'true')
      
      // Save the current expanded states from sessionStorage if they exist
      const expandedCards = sessionStorage.getItem('expandedCards')
      const expandedShipmentDetails = sessionStorage.getItem('expandedShipmentDetails')
      
      // Use router.refresh() to get fresh data from the server
      router.refresh()
      
      // After refresh, ensure the expanded states are preserved
      if (expandedCards) {
        sessionStorage.setItem('expandedCards', expandedCards)
      }
      
      if (expandedShipmentDetails) {
        sessionStorage.setItem('expandedShipmentDetails', expandedShipmentDetails)
      }
    } catch (error) {
      console.error('Error refreshing documents:', error)
    }
  }, [router])
  
  // When the component mounts or initialClient changes, update the state
  useEffect(() => {
    setClient(initialClient)
  }, [initialClient])
  
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='flex items-center gap-4'>
            <Link href='/dashboard/clients'>
              <Button variant='outline' size='icon'>
                <ArrowLeft className='h-4 w-4' />
              </Button>
            </Link>
            <div>
              <h1 className='text-3xl font-bold'>{client.name}</h1>
              <p className='text-muted-foreground'>RIF: {client.rif}</p>
            </div>
          </div>
        </div>
      </div>

      <DocumentList 
        clientId={client.id} 
        documents={convertToDocumentFormat(client.documents) as any}
        onDocumentDeleted={refreshDocuments}
      />
    </div>
  )
} 