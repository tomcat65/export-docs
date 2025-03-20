'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Upload, Loader2, Calendar } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { AnthropicApiError } from './anthropic-api-error'

interface DocumentUploadProps {
  clientId: string
}

export function DocumentUpload({ clientId }: DocumentUploadProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [showDatePrompt, setShowDatePrompt] = useState(false)
  const [documentId, setDocumentId] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [isSavingDate, setIsSavingDate] = useState(false)
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [duplicateDocData, setDuplicateDocData] = useState<any>(null)
  const [duplicateDocId, setDuplicateDocId] = useState<string>('')
  const [fileExists, setFileExists] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')
  const [warningData, setWarningData] = useState<any>(null)
  const [apiKeyError, setApiKeyError] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Store the file for later use in button handlers
    setCurrentFile(file)

    setIsProcessing(true)
    
    try {
      // Validate file type
      const isPDF = file.name.toLowerCase().endsWith('.pdf')
      const isImage = file.type.startsWith('image/')
      
      if (!isPDF && !isImage) {
        throw new Error('Invalid file type. Please upload a PDF or image file.')
      }

      // Convert file to base64
      setProgress('Processing document...')
      const reader = new FileReader()
      
      reader.onload = async () => {
        try {
          const base64String = reader.result?.toString().split(',')[1]
          
          if (!base64String) {
            throw new Error('Failed to convert file to base64')
          }
          
          // Create document data object
          const documentData = {
            type: isPDF ? 'pdf' : 'image',
            data: base64String
          }
          
          setProgress('Analyzing document...')
          // Upload and process document
          const formData = new FormData()
          formData.append('file', file)
          formData.append('document', JSON.stringify(documentData))

          const response = await fetch(`/api/clients/${clientId}/documents/upload`, {
            method: 'POST',
            body: formData
          })

          if (!response.ok) {
            // Clone the response before reading it so we can try both JSON and text
            const responseClone = response.clone();
            
            // Try to parse as JSON first
            try {
              const errorData = await response.json();
              
              // Special handling for client mismatch errors
              if (errorData.status === 'client_mismatch') {
                const message = errorData.suggestedClient 
                  ? `This document belongs to ${errorData.suggestedClient.name}. Please select the correct client.` 
                  : errorData.error;
                  
                setIsProcessing(false)
                toast({
                  title: 'Client Mismatch',
                  description: message,
                  variant: 'destructive',
                  duration: 5000 // Show for longer
                })
                return // Prevent further processing
              }
              
              throw new Error(errorData.error || 'Failed to upload document')
            } catch (jsonError) {
              // If JSON parsing fails, get the text response from the cloned response
              const textError = await responseClone.text();
              throw new Error(textError || 'Failed to upload document. Server returned non-JSON response.');
            }
          }

          // Clone the response before reading it, so we can safely read it
          const responseClone = response.clone();
          
          // Improved JSON parsing error handling
          let result;
          try {
            result = await response.json();
          } catch (jsonError) {
            console.error('Error parsing JSON response:', jsonError);
            // Use the cloned response for text if JSON parsing fails
            const textContent = await responseClone.text();
            throw new Error(`Failed to parse server response: ${textContent}`);
          }
          
          // Check the response
          if (result.warning) {
            // Set processing to false first so the spinner stops
            setIsProcessing(false);
            
            if (result.duplicate && result.existingDocumentId) {
              // Store duplicate document information
              setDuplicateDocData(result.document);
              setDuplicateDocId(result.existingDocumentId);
              
              // Show warning and provide options
              setWarningMessage(result.message);
              setWarningData(result);
            } else {
              // Regular warning without document options
              toast({
                title: 'Warning',
                description: result.message,
                variant: 'destructive',
              });
            }
          } else {
            // Check if date is missing in the uploaded document
            if (result.documentId && 
                result.document?.bolData && 
                (!result.document.bolData.dateOfIssue || result.document.bolData.dateOfIssue === '')) {
              // Set document ID and show date prompt
              setDocumentId(result.documentId)
              setShowDatePrompt(true)
            } else {
              // Show success and redirect if date exists
              showSuccessAndRedirect()
            }
          }
        } catch (error) {
          console.error('Error processing document:', error)
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to process document',
            variant: 'destructive'
          })
          setIsProcessing(false)
        } finally {
          setProgress('')
        }
      }
      
      reader.onerror = () => {
      toast({
          title: 'Error',
          description: 'Failed to read file',
          variant: 'destructive'
      })
        setIsProcessing(false)
        setProgress('')
      }

      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error processing document:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process document',
        variant: 'destructive'
      })
      setIsProcessing(false)
      setProgress('')
    } finally {
      // Don't reset the file input here
    }
  }

  // Separate handler for the replace functionality
  const handleReplaceExisting = async () => {
    if (!currentFile) {
      toast({
        title: 'Error',
        description: 'The file is no longer available. Please try uploading again.',
        variant: 'destructive'
      });
      return;
    }
    
    if (!duplicateDocId) {
      toast({
        title: 'Error',
        description: 'No duplicate document ID found.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      setProgress('Processing document for replacement...');
      
      // First, read the file as base64 to include the data
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const base64String = e.target?.result?.toString();
          
          if (!base64String) {
            throw new Error('Failed to read file as base64');
          }
          
          setProgress('Extracting data from document...');
          
          const formData = new FormData();
          formData.append('file', currentFile);
          
          // Add document data including the base64 content to avoid Claude processing errors
          const documentData = {
            type: currentFile.type.startsWith('image/') ? 'image' : 'pdf',
            data: base64String,
            overwriteExisting: true,
            existingDocumentId: duplicateDocId,
            forceExtract: true // Tell the server to re-extract all data including carrier reference
          };
          
          formData.append('document', JSON.stringify(documentData));
          
          setProgress('Uploading replacement document...');
          
          // Make the upload request
          const response = await fetch(`/api/clients/${clientId}/documents/upload`, {
            method: 'POST',
            body: formData
          });
          
          const data = await response.json();
          
          if (data.success) {
            toast({
              title: 'Success',
              description: 'Document successfully replaced with updated data.',
              variant: 'default',
            });
            
            // Clear warning state
            setWarningMessage('');
            setWarningData(null);
            
            // Redirect to document view
            showSuccessAndRedirect();
          } else {
            toast({
              title: 'Error',
              description: data.error || 'Failed to replace document.',
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('Error replacing document:', error);
          toast({
            title: 'Error',
            description: 'An error occurred while replacing the document.',
            variant: 'destructive',
          });
        } finally {
          setIsProcessing(false);
          setProgress('');
        }
      };
      
      reader.onerror = () => {
        toast({
          title: 'Error',
          description: 'Failed to read file',
          variant: 'destructive'
        });
        setIsProcessing(false);
        setProgress('');
      };
      
      // Start reading the file
      reader.readAsDataURL(currentFile);
    } catch (error) {
      console.error('Error processing document for replacement:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while preparing the document for replacement.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      setProgress('');
    }
  };

  const handleDateSubmit = async () => {
    if (!dateInput) return
    
    setIsSavingDate(true)
    
    try {
      const response = await fetch(`/api/documents/${documentId}/update-date`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dateOfIssue: dateInput }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update date')
      }
      
      toast({
        title: 'Date Added',
        description: 'Document date has been added successfully',
      })
      
      // Close the dialog and redirect
      setShowDatePrompt(false)
      showSuccessAndRedirect()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update date',
        variant: 'destructive',
      })
      setIsSavingDate(false)
    }
  }

  const showSuccessAndRedirect = () => {
    toast({
      title: 'Success',
      description: 'Document uploaded and processed successfully',
      variant: 'default'
    })
    
    // Add small delay to ensure toast is seen
    setTimeout(() => {
      router.push(`/dashboard/clients/${clientId}`)
    }, 1500)
    
    setIsProcessing(false)
  }

  const handleSkipDate = () => {
    setShowDatePrompt(false)
    showSuccessAndRedirect()
  }

  // Function to repair document file ID by matching filename
  const handleRepairDocument = async (documentId: string) => {
    try {
      setIsProcessing(true);
      setProgress('Repairing document record...');
      
      // Call the repair API
      const response = await fetch(`/api/documents/${documentId}/repair`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success && result.repaired) {
        toast({
          title: 'Document Repaired',
          description: 'The document record has been repaired and can now be viewed.',
          variant: 'default'
        });
        
        // Check if file exists now
        await checkFileExists(documentId);
      } else if (result.success && !result.repaired) {
        toast({
          title: 'No Repair Needed',
          description: result.message,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Repair Failed',
          description: result.message || 'Could not repair the document record.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error repairing document:', error);
      toast({
        title: 'Error',
        description: 'Failed to repair document record.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  // Function to check if file exists in GridFS
  const checkFileExists = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/exists`);
      const data = await response.json();
      
      setFileExists(data.exists);
      return data.exists;
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  };

  useEffect(() => {
    if (warningMessage) {
      // Make sure we're not in a processing state when showing warnings
      setIsProcessing(false);
      
      if (duplicateDocId) {
        // Check if the file exists
        checkFileExists(duplicateDocId).then(exists => {
          // Create toast with appropriate actions based on file existence
          const { dismiss } = toast({
            title: 'Warning',
            description: (
              <div className="space-y-2">
                <p>{warningMessage}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => { 
                      setWarningMessage(''); 
                      setWarningData(null);
                      dismiss();
                    }}
                  >
                    Cancel
                  </Button>
                  
                  {fileExists ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        window.open(`/api/documents/${duplicateDocId}/view`, '_blank');
                      }}
                    >
                      View Existing
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          handleRepairDocument(duplicateDocId);
                          dismiss();
                        }}
                      >
                        Repair Document
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          handleReplaceExisting();
                          dismiss();
                        }}
                      >
                        Replace Missing File
                      </Button>
                    </>
                  )}
                  
                  {fileExists && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        handleReplaceExisting();
                        dismiss();
                      }}
                    >
                      Replace Anyway
                    </Button>
                  )}
                </div>
              </div>
            ),
            duration: 0,
          });
        });
      } else {
        // Regular warning without document options
        toast({
          title: 'Warning',
          description: warningMessage,
          variant: 'destructive',
        });
      }
    }
  }, [warningMessage, warningData, fileExists, toast, duplicateDocId]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      try {
        // Reset any previous error state
        setApiKeyError(false);
        
        // ... rest of the existing upload logic
      } catch (error) {
        // ... existing error logic
        
        // Check if this is an API key error
        const errorDetail = error?.response?.data?.needsNewApiKey || 
                           error?.message?.includes('API key') ||
                           error?.message?.includes('authentication');
        
        if (errorDetail) {
          setApiKeyError(true);
          console.error('Anthropic API Key Error:', error?.response?.data?.message || 'Authentication failed');
        }
      }
    },
    // ... other dependencies
  );

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Upload Bill of Lading</CardTitle>
        <CardDescription>
          Upload a BOL document to extract shipping information. 
          Supported formats: PDF, PNG, JPG
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-center w-full">
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-4 text-gray-500" />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  PDF, PNG, or JPG (max 10MB)
                </p>
              </div>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                onChange={onFileChange}
                disabled={isProcessing}
              />
            </label>
          </div>

          {isProcessing && (
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progress}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

      {/* Date Input Modal */}
      <Dialog open={showDatePrompt} onOpenChange={(open) => !open && handleSkipDate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Missing Date</DialogTitle>
            <DialogDescription>
              No date was detected in the document. Please provide the date of issue for this Bill of Lading.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="date-input" className="flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Date of Issue
              </Label>
              <input
                id="date-input"
                type="date"
                className="w-full p-2 border rounded-md"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleSkipDate}
            >
              Skip
            </Button>
            <Button 
              onClick={handleDateSubmit}
              disabled={!dateInput || isSavingDate}
            >
              {isSavingDate ? 'Saving...' : 'Save Date'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {apiKeyError ? (
        <div className="mb-6">
          <AnthropicApiError 
            message="The API key for Anthropic's Claude service appears to be invalid or expired. Document processing will not work until this is fixed."
            onRetry={() => setApiKeyError(false)}
          />
        </div>
      ) : null}
    </>
  )
} 