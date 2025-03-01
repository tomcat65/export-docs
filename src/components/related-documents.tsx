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
import { Loader2, FileText, FilePlus, Edit, Save, RefreshCw } from 'lucide-react'
import { PackingListEditor } from './packing-list-editor'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface Document {
  _id: string
  type: string
  fileName: string
  relatedBolId?: string
  packingListData?: {
    documentNumber: string
    date: string
    poNumber?: string
  }
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
  
  // Add state for the edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingPL, setEditingPL] = useState<Document | null>(null)
  const [formData, setFormData] = useState({
    documentNumber: '',
    date: '',
    poNumber: ''
  })

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
      } else if (type === 'COO') {
        setGeneratingCOO(true)
      }

      console.log(`Generating ${type} document for BOL ID: ${bolId} with mode: ${mode}`);
      
      const endpoint = type.toLowerCase();
      const url = `/api/documents/${bolId}/generate/${endpoint}`;
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
      
      const docType = type === 'PL' 
        ? 'Packing List' 
        : 'Certificate of Origin';
      
      toast({
        title: 'Success',
        description: `${docType} generated successfully`,
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
      } else if (type === 'COO') {
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
    
    const exists = type === 'PL' 
      ? existingPL 
      : existingCOO;
        
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

  // Add handlers for edit functionality
  const handleOpenEditDialog = (doc: Document) => {
    setEditingPL(doc)
    const poValue = doc.packingListData?.poNumber || '';
    console.log('Opening edit dialog with PO number:', poValue, 'Type:', typeof poValue);
    
    setFormData({
      documentNumber: doc.packingListData?.documentNumber || '',
      date: doc.packingListData?.date || '',
      poNumber: poValue
    })
    setEditDialogOpen(true)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    console.log(`Form field changed: ${name} = "${value}"`);
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPL) return
    
    setIsSubmitting(true)

    try {
      // Send the form data exactly as it is
      const dataToSend = {
        documentNumber: formData.documentNumber,
        date: formData.date,
        poNumber: formData.poNumber
      };
      
      console.log('Submitting form data:', dataToSend);
      
      // Step 1: Update the document details
      const response = await fetch(`/api/documents/${editingPL._id}/update-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update document details')
      }

      const updateResult = await response.json();
      console.log('Document details updated successfully:', updateResult);

      // Step 2: Regenerate the PDF
      const regenerateResponse = await fetch(`/api/documents/${editingPL._id}/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!regenerateResponse.ok) {
        const errorData = await regenerateResponse.json()
        throw new Error(errorData.error || 'Failed to regenerate document')
      }

      const result = await regenerateResponse.json()
      console.log('Document regenerated successfully:', result);
      
      toast({
        title: 'Success',
        description: 'Document updated and regenerated successfully',
      })

      // Open the document in a new tab if available
      if (result.document?.id) {
        window.open(`/api/documents/${result.document.id}/view`, '_blank')
      }

      // Close the dialog
      setEditDialogOpen(false)
      
      // Trigger refresh
      onDocumentGenerated()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update document details',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Modify renderDocumentButton to include Edit button for PL
  const renderDocumentButton = (type: 'PL' | 'COO') => {
    const exists = type === 'PL' 
      ? existingPL 
      : existingCOO;
        
    const isGenerating = type === 'PL' 
      ? generatingPL 
      : generatingCOO;
        
    const label = type === 'PL' 
      ? 'Packing List' 
      : 'Certificate of Origin';

    if (exists) {
      // For COO documents, use the same button pattern as other documents
      if (type === 'COO') {
        return (
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/documents/${exists._id}/view`, '_blank')}
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
        );
      }
      
      // For Packing List, add Edit button next to View and Regenerate
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
          {type === 'PL' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenEditDialog(exists)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
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
      );
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

      {/* Remove the card editor and replace with a dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Packing List Details</DialogTitle>
            <DialogDescription>
              Update the document number, date, or PO number for this packing list.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="documentNumber">Document Number</Label>
                <Input
                  id="documentNumber"
                  name="documentNumber"
                  value={formData.documentNumber}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="poNumber">Purchase Order Number</Label>
                <Input
                  id="poNumber"
                  name="poNumber"
                  value={formData.poNumber}
                  onChange={handleChange}
                  placeholder="Enter client's PO number"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty if no PO number is required
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save & Regenerate
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open: boolean) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Document</AlertDialogTitle>
            <AlertDialogDescription>
              A {confirmDialog.type === 'PL' 
                 ? 'Packing List' 
                 : 'Certificate of Origin'} for this BOL already exists. 
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