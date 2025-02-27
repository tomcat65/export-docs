'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, FileText, FilePlus } from 'lucide-react'

interface Document {
  _id: string
  type: string
  fileName: string
  relatedBolId?: string
}

interface RelatedDocumentsProps {
  bolId: string
  bolNumber: string
  existingDocuments: Document[]
  onDocumentGenerated: () => void
}

export function RelatedDocuments({
  bolId,
  bolNumber,
  existingDocuments,
  onDocumentGenerated,
}: RelatedDocumentsProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [generatingPL, setGeneratingPL] = useState(false)
  const [generatingCOO, setGeneratingCOO] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'PL' | 'COO'
    mode: 'new' | 'overwrite'
  }>({ open: false, type: 'PL', mode: 'new' })

  // Validate bolId on component mount
  useEffect(() => {
    if (!bolId || bolId === 'undefined') {
      console.warn(`RelatedDocuments component received invalid bolId: ${bolId}`);
    }
  }, [bolId]);

  // Check if documents already exist
  const existingPL = existingDocuments.find(
    (doc) => doc.type === 'PL' && doc.relatedBolId === bolId
  )
  const existingCOO = existingDocuments.find(
    (doc) => doc.type === 'COO' && doc.relatedBolId === bolId
  )

  const handleGenerateDocument = async (type: 'PL' | 'COO', mode: 'new' | 'overwrite') => {
    try {
      // Early validation of bolId
      if (!bolId || bolId === 'undefined') {
        throw new Error(`Invalid BOL ID: ${bolId}`);
      }

      if (type === 'PL') {
        setGeneratingPL(true)
      } else {
        setGeneratingCOO(true)
      }

      console.log(`Generating ${type} document for BOL ID: ${bolId} with mode: ${mode}`);
      
      const url = `/api/documents/${bolId}/generate/${type.toLowerCase()}`;
      console.log(`Making request to: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
        // Add these options to ensure the fetch doesn't fail silently
        cache: 'no-cache',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Server responded with ${response.status}: ${errorText}`);
        throw new Error(`Failed to generate ${type}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log(`Response data:`, responseData);
      
      toast({
        title: 'Success',
        description: `${type === 'PL' ? 'Packing List' : 'Certificate of Origin'} generated successfully`,
      });
      
      // Set a flag in sessionStorage to preserve the expanded state
      sessionStorage.setItem('preserveDocumentListState', 'true');
      
      // Refresh the document list without refreshing the page
      onDocumentGenerated();
      
      // Open the generated document in a new tab if available
      if (responseData.document && responseData.document.id) {
        // Use setTimeout to ensure the document opens after the refresh is initiated
        setTimeout(() => {
          window.open(`/api/documents/download/${responseData.document.id}`, '_blank');
        }, 100);
      }
    } catch (error) {
      console.error(`Error generating ${type}:`, error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to generate ${type}`,
        variant: 'destructive',
      });
    } finally {
      if (type === 'PL') {
        setGeneratingPL(false);
      } else {
        setGeneratingCOO(false);
      }
      setConfirmDialog({ ...confirmDialog, open: false });
    }
  };

  const openConfirmDialog = (type: 'PL' | 'COO') => {
    // Validate bolId before proceeding
    if (!bolId || bolId === 'undefined') {
      toast({
        title: 'Error',
        description: `Cannot generate document: Invalid BOL ID`,
        variant: 'destructive',
      });
      return;
    }
    
    const exists = type === 'PL' ? existingPL : existingCOO
    if (exists) {
      setConfirmDialog({
        open: true,
        type,
        mode: 'overwrite',
      })
    } else {
      handleGenerateDocument(type, 'new')
    }
  }

  const renderDocumentButton = (type: 'PL' | 'COO') => {
    const exists = type === 'PL' ? existingPL : existingCOO
    const isGenerating = type === 'PL' ? generatingPL : generatingCOO
    const label = type === 'PL' ? 'Packing List' : 'Certificate of Origin'

    if (exists) {
      return (
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/documents/download/${exists._id}`, '_blank')}
          >
            <FileText className="mr-2 h-4 w-4" />
            View {label}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openConfirmDialog(type)}
            disabled={isGenerating || !bolId}
          >
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FilePlus className="mr-2 h-4 w-4" />
            )}
            Regenerate
          </Button>
        </div>
      )
    }

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => openConfirmDialog(type)}
        disabled={isGenerating || !bolId}
      >
        {isGenerating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FilePlus className="mr-2 h-4 w-4" />
        )}
        Generate {label}
      </Button>
    )
  }

  // If bolId is invalid, don't render the component
  if (!bolId || bolId === 'undefined') {
    return null;
  }

  return (
    <div className="mt-4 space-y-4 border rounded-md p-4">
      <h3 className="text-lg font-semibold">Related Documents</h3>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span>Packing List</span>
          {renderDocumentButton('PL')}
        </div>
        <div className="flex justify-between items-center">
          <span>Certificate of Origin</span>
          {renderDocumentButton('COO')}
        </div>
      </div>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open: boolean) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Document</AlertDialogTitle>
            <AlertDialogDescription>
              A {confirmDialog.type === 'PL' ? 'Packing List' : 'Certificate of Origin'} for this BOL already exists. 
              Would you like to overwrite the existing document or create a new version?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleGenerateDocument(confirmDialog.type, 'overwrite')}>
              Overwrite Existing
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleGenerateDocument(confirmDialog.type, 'new')}>
              Create New Version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
} 