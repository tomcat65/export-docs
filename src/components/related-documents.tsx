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
import { Loader2, FileText, FilePlus, Edit, Save, RefreshCw, Trash2 } from 'lucide-react'
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
  const [uploadingInvoiceExport, setUploadingInvoiceExport] = useState(false)
  const [uploadingInvoice, setUploadingInvoice] = useState(false)
  const [uploadingCOA, setUploadingCOA] = useState(false)
  const [uploadingSED, setUploadingSED] = useState(false)
  const [uploadingDataSheet, setUploadingDataSheet] = useState(false)
  const [uploadingSafetySheet, setUploadingSafetySheet] = useState(false)
  const [uploadingMultiple, setUploadingMultiple] = useState(false)
  const [multipleUploadType, setMultipleUploadType] = useState<string | null>(null)
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
  
  // Add state to track screen size
  const [isMobile, setIsMobile] = useState(false)
  
  // Set up effect to track screen size
  useEffect(() => {
    // Function to update the isMobile state
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 640) // 640px is the sm breakpoint in Tailwind
    }
    
    // Set initial value
    checkIsMobile()
    
    // Add event listener
    window.addEventListener('resize', checkIsMobile)
    
    // Clean up
    return () => {
      window.removeEventListener('resize', checkIsMobile)
    }
  }, [])

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
  // Get arrays of each document type that can have multiple instances
  const invoicesExport = existingDocuments.filter(
    (doc) => doc.type === 'INVOICE_EXPORT' && doc.relatedBolId === bolId
  )
  const invoices = existingDocuments.filter(
    (doc) => doc.type === 'INVOICE' && doc.relatedBolId === bolId
  )
  const coas = existingDocuments.filter(
    (doc) => doc.type === 'COA' && doc.relatedBolId === bolId
  )
  // SED is a single document per BOL
  const existingSED = existingDocuments.find(
    (doc) => doc.type === 'SED' && doc.relatedBolId === bolId
  )
  const dataSheets = existingDocuments.filter(
    (doc) => doc.type === 'DATA_SHEET' && doc.relatedBolId === bolId
  )
  const safetySheets = existingDocuments.filter(
    (doc) => doc.type === 'SAFETY_SHEET' && doc.relatedBolId === bolId
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
    
    // Properly handle the poNumber field, treating null/undefined as empty string
    // but preserving actual empty strings
    const poValue = doc.packingListData?.poNumber !== undefined && doc.packingListData?.poNumber !== null
      ? String(doc.packingListData.poNumber) // Use String() for explicit conversion
      : ''; // explicit empty string for null/undefined
    
    console.log('Opening edit dialog with PO number:', {
      rawValue: doc.packingListData?.poNumber,
      rawType: typeof doc.packingListData?.poNumber,
      isEmpty: doc.packingListData?.poNumber === '',
      finalValue: poValue,
      finalType: typeof poValue
    });
    
    setFormData({
      documentNumber: doc.packingListData?.documentNumber || '',
      date: doc.packingListData?.date || '',
      poNumber: poValue // Use the properly handled value
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

  const handleSubmitEdit = async () => {
    setIsSubmitting(true);
    
    try {
      // Log the form data being submitted
      console.log('Submitting form data:', formData);
      
      // Create a data object with all form fields, explicitly handling empty strings
      const dataToSend = {
        documentNumber: formData.documentNumber !== undefined ? formData.documentNumber : '',
        date: formData.date !== undefined ? formData.date : '',
        // For poNumber, we need to be very explicit to ensure empty strings are preserved
        // and not converted to null or undefined
        poNumber: formData.poNumber !== undefined && formData.poNumber !== null 
          ? String(formData.poNumber) // Use String() for explicit conversion 
          : '' // Explicit empty string if undefined or null
      };
      
      // Add detailed logging to help diagnose the issue
      console.log('Data being sent to API:', {
        documentNumber: {
          value: dataToSend.documentNumber,
          type: typeof dataToSend.documentNumber,
          length: dataToSend.documentNumber.length
        },
        date: {
          value: dataToSend.date,
          type: typeof dataToSend.date,
          length: dataToSend.date.length
        },
        poNumber: {
          value: dataToSend.poNumber,
          type: typeof dataToSend.poNumber,
          length: dataToSend.poNumber.length
        }
      });
      
      // Use the new update-details endpoint which handles both updating and regenerating
      const response = await fetch(`/api/documents/${editingPL?._id}/update-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update document');
      }

      const data = await response.json();
      console.log('Update response:', data);
      
      // Update the document in the list with the new data
      const updatedDocuments = existingDocuments.map(doc => {
        if (doc._id === editingPL?._id) {
          return {
            ...doc,
            packingListData: {
              ...doc.packingListData,
              ...formData
            }
          };
        }
        return doc;
      });
      
      setEditingPL(null);
      setEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Document updated successfully",
      });
      
      // Refresh the document list to show updated data
      onDocumentGenerated();
    } catch (error) {
      console.error('Error updating document:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update document",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Modify renderDocumentButton to be mobile-friendly and view-focused on small screens
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
      // For both COO and PL, use mobile-friendly layout with View-only on mobile
      return (
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => window.open(`/api/documents/${type === 'COO' ? exists._id + '/view' : 'download/' + exists._id}`, '_blank')}
          >
            <FileText className="mr-2 h-4 w-4" />
            View {label}
          </Button>
          
          {/* Edit button - hidden on mobile */}
          {type === 'PL' && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex w-full justify-start sm:w-auto"
              onClick={() => handleOpenEditDialog(exists)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          
          {/* Regenerate button - hidden on mobile */}
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex w-full justify-start sm:w-auto"
            onClick={() => openConfirmDialog(type)}
            disabled={isGenerating || !bolId}
          >
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Regenerate
          </Button>
        </div>
      );
    }

    // For non-existent documents, hide the Generate button on mobile
    return (
      <Button
        variant="outline"
        size="sm"
        className="hidden sm:flex w-full justify-start sm:w-auto"
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

  // Function to handle document upload
  const handleUploadDocument = async (type: string) => {
    // Set loading state based on document type
    switch (type) {
      case 'INVOICE_EXPORT':
        setUploadingInvoiceExport(true);
        break;
      case 'INVOICE':
        setUploadingInvoice(true);
        break;
      case 'COA':
        setUploadingCOA(true);
        break;
      case 'SED':
        setUploadingSED(true);
        break;
      case 'DATA_SHEET':
        setUploadingDataSheet(true);
        break;
      case 'SAFETY_SHEET':
        setUploadingSafetySheet(true);
        break;
    }

    try {
      // Create a file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf,.doc,.docx'; // Accept common document formats
      
      // Create a promise to handle the file selection
      const fileSelected = new Promise<File | null>((resolve) => {
        fileInput.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          resolve(files ? files[0] : null);
        };
        
        // Handle cancel
        fileInput.oncancel = () => {
          resolve(null);
        };
      });
      
      // Trigger the file selection dialog
      fileInput.click();
      
      // Wait for file selection
      const file = await fileSelected;
      if (!file) {
        // User canceled the upload
        switch (type) {
          case 'INVOICE_EXPORT':
            setUploadingInvoiceExport(false);
            break;
          case 'INVOICE':
            setUploadingInvoice(false);
            break;
          case 'COA':
            setUploadingCOA(false);
            break;
          case 'SED':
            setUploadingSED(false);
            break;
          case 'DATA_SHEET':
            setUploadingDataSheet(false);
            break;
          case 'SAFETY_SHEET':
            setUploadingSafetySheet(false);
            break;
        }
        return;
      }
      
      // Create form data for upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      formData.append('relatedBolId', bolId);
      
      // Upload the document
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload document');
      }
      
      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });
      
      // Refresh the document list
      onDocumentGenerated();
      
    } catch (error) {
      console.error(`Error uploading ${type}:`, error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to upload document`,
        variant: 'destructive',
      });
    } finally {
      // Reset loading state
      switch (type) {
        case 'INVOICE_EXPORT':
          setUploadingInvoiceExport(false);
          break;
        case 'INVOICE':
          setUploadingInvoice(false);
          break;
        case 'COA':
          setUploadingCOA(false);
          break;
        case 'SED':
          setUploadingSED(false);
          break;
        case 'DATA_SHEET':
          setUploadingDataSheet(false);
          break;
        case 'SAFETY_SHEET':
          setUploadingSafetySheet(false);
          break;
      }
    }
  };

  // Function to handle multiple document uploads at once
  const handleMultipleUpload = async (type: string) => {
    setUploadingMultiple(true);
    setMultipleUploadType(type);

    try {
      // Create a file input element with multiple attribute
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.accept = '.pdf,.doc,.docx'; // Accept common document formats
      
      // Create a promise to handle the file selection
      const filesSelected = new Promise<FileList | null>((resolve) => {
        fileInput.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          resolve(files);
        };
        
        // Handle cancel
        fileInput.oncancel = () => {
          resolve(null);
        };
      });
      
      // Trigger the file selection dialog
      fileInput.click();
      
      // Wait for file selection
      const files = await filesSelected;
      if (!files || files.length === 0) {
        // User canceled the upload or selected no files
        setUploadingMultiple(false);
        setMultipleUploadType(null);
        return;
      }
      
      let successCount = 0;
      let errorCount = 0;

      // Loop through each file and upload it
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Create form data for each file
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('relatedBolId', bolId);
        
        try {
          // Upload the document
          const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error(`Error uploading ${file.name}:`, errorData.error);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          errorCount++;
        }
      }

      // Show appropriate toast based on results
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: 'Success',
          description: `${successCount} document${successCount !== 1 ? 's' : ''} uploaded successfully`,
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: 'Partial Success',
          description: `${successCount} document${successCount !== 1 ? 's' : ''} uploaded, ${errorCount} failed`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to upload documents',
          variant: 'destructive',
        });
      }
      
      // Refresh the document list
      if (successCount > 0) {
        onDocumentGenerated();
      }
      
    } catch (error) {
      console.error(`Error in multiple upload:`, error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to upload documents`,
        variant: 'destructive',
      });
    } finally {
      setUploadingMultiple(false);
      setMultipleUploadType(null);
    }
  };

  // Render document button for uploadable document types (single instance)
  const renderUploadDocumentButton = (type: string, label: string, exists: boolean, isUploading: boolean) => {
    if (exists) {
      // For existing documents, show view button
      const existingDoc = existingDocuments.find(
        (doc) => doc.type === type && doc.relatedBolId === bolId
      );
      
      return (
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => window.open(`/api/documents/download/${existingDoc?._id}`, '_blank')}
          >
            <FileText className="mr-2 h-4 w-4" />
            View {label}
          </Button>
          
          {/* Replace button - hidden on mobile */}
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex w-full justify-start sm:w-auto"
            onClick={() => handleUploadDocument(type)}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Replace
          </Button>
        </div>
      );
    }

    // For non-existent documents, show upload button
    return (
      <Button
        variant="outline"
        size="sm"
        className="hidden sm:flex w-full justify-start sm:w-auto"
        onClick={() => handleUploadDocument(type)}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FilePlus className="mr-2 h-4 w-4" />
        )}
        Upload {label}
      </Button>
    );
  };

  // Render document list for document types that can have multiple instances
  const renderMultipleDocumentsSection = (type: string, label: string, documents: Document[], isUploading: boolean) => {
    const isMultipleUploading = uploadingMultiple && multipleUploadType === type;
    
    return (
      <div className="space-y-2">
        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc._id} className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => window.open(`/api/documents/download/${doc._id}`, '_blank')}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View {label} {doc.fileName.split('.')[0]}
                </Button>
                
                {/* Delete button - hidden on mobile */}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex w-full justify-start sm:w-auto text-red-500 hover:text-red-700"
                  onClick={() => confirmDeleteDocument(doc)}
                  disabled={isUploading || isMultipleUploading}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Combined upload button - handles both single and multiple uploads */}
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex w-full justify-start sm:w-auto"
            onClick={() => handleMultipleUpload(type)}
            disabled={isUploading || isMultipleUploading}
          >
            {isMultipleUploading || isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FilePlus className="mr-2 h-4 w-4" />
            )}
            Upload {label}{documents.length > 0 ? " (more)" : "(s)"}
          </Button>
        </div>
      </div>
    );
  };

  // Function to confirm document deletion
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const confirmDeleteDocument = (doc: Document) => {
    setDocumentToDelete(doc);
    setShowDeleteConfirm(true);
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      const response = await fetch(`/api/documents/${documentToDelete._id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      toast({
        title: 'Document Deleted',
        description: `${documentToDelete.fileName} has been deleted successfully`,
      });

      // Refresh the document list
      onDocumentGenerated();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setDocumentToDelete(null);
    }
  };

  // If bolId is invalid, don't render the component
  if (!bolId || bolId === 'undefined') {
    return null;
  }

  return (
    <div className="mt-4 space-y-4 border rounded-md p-4">
      <h3 className="text-lg font-semibold">Related Documents</h3>
      <div className="space-y-4">
        {/* Only show documents that exist on mobile, or all on desktop */}
        {(existingPL || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{existingPL ? 'Packing List' : 'Add Packing List'}</p>
            {renderDocumentButton('PL')}
          </div>
        )}
        
        {(existingCOO || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{existingCOO ? 'Certificate of Origin' : 'Add Certificate of Origin'}</p>
            {renderDocumentButton('COO')}
          </div>
        )}

        {/* Multiple document type sections */}
        {(invoicesExport.length > 0 || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{invoicesExport.length > 0 ? `Invoices for Export (${invoicesExport.length})` : 'Add Invoices for Export'}</p>
            {renderMultipleDocumentsSection('INVOICE_EXPORT', 'Invoice for Export', invoicesExport, uploadingInvoiceExport)}
          </div>
        )}
        
        {(invoices.length > 0 || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{invoices.length > 0 ? `Real Invoices (${invoices.length})` : 'Add Real Invoices'}</p>
            {renderMultipleDocumentsSection('INVOICE', 'Real Invoice', invoices, uploadingInvoice)}
          </div>
        )}
        
        {(coas.length > 0 || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{coas.length > 0 ? `Certificates of Analysis (${coas.length})` : 'Add Certificates of Analysis'}</p>
            {renderMultipleDocumentsSection('COA', 'Certificate of Analysis', coas, uploadingCOA)}
          </div>
        )}
        
        {/* SED - Single document per BOL */}
        {(existingSED || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{existingSED ? 'Shipper\'s Export Declaration (SED)' : 'Add Shipper\'s Export Declaration (SED)'}</p>
            {renderMultipleDocumentsSection('SED', 'SED', existingSED ? [existingSED] : [], uploadingSED)}
          </div>
        )}
        
        {/* Multiple data sheets */}
        {(dataSheets.length > 0 || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{dataSheets.length > 0 ? `Product Data Sheets (${dataSheets.length})` : 'Add Product Data Sheets'}</p>
            {renderMultipleDocumentsSection('DATA_SHEET', 'Product Data Sheet', dataSheets, uploadingDataSheet)}
          </div>
        )}
        
        {/* Multiple safety sheets */}
        {(safetySheets.length > 0 || !isMobile) && (
          <div className="flex flex-col space-y-2">
            <p className="font-medium">{safetySheets.length > 0 ? `Product Safety Sheets (${safetySheets.length})` : 'Add Product Safety Sheets'}</p>
            {renderMultipleDocumentsSection('SAFETY_SHEET', 'Product Safety Sheet', safetySheets, uploadingSafetySheet)}
          </div>
        )}

        {/* Add a message when no documents exist on mobile - Update to include all document types */}
        {!existingPL && !existingCOO && invoicesExport.length === 0 && invoices.length === 0 && 
          coas.length === 0 && !existingSED && dataSheets.length === 0 && safetySheets.length === 0 && isMobile && (
          <p className="text-sm text-muted-foreground">
            No related documents available. Use desktop or tablet view to create documents.
          </p>
        )}
      </div>

      {/* Alert dialog for document deletion */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog remains unchanged */}
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
            <DialogFooter className="flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={handleSubmitEdit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save & Update"
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