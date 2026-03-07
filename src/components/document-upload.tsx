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
import { BolUploadErrorDialog } from './documents/BolUploadErrorDialog'
import { analyzeProcessingError, generateDiagnosticInfo } from '@/lib/document-processing-utils'

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
  const [showSkipOption, setShowSkipOption] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [technicalError, setTechnicalError] = useState('')
  const [errorStatus, setErrorStatus] = useState('')

  // Process BOL document: Firebase client-side extraction → lightweight save API
  const processDocumentWithFirebase = async (file: File, clientId: string) => {
    try {
      setIsProcessing(true);
      setUploadError('');
      setTechnicalError('');
      setErrorStatus('');
      setProgress('Reading document file...');

      // Convert file to base64
      const base64Content = await readFileAsBase64(file);

      if (!base64Content) {
        throw new Error('Failed to read file content');
      }

      // Show a more detailed progress message if the file is large
      const fileSizeMB = Math.round(file.size / (1024 * 1024) * 10) / 10;
      if (fileSizeMB > 5) {
        setProgress(`Large file detected (${fileSizeMB}MB). Processing may take several minutes...`);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Step 1: Process with Firebase directly from the client (no Vercel timeout)
      const maxRetries = 2;
      let lastError: any = null;
      let extractedDocument: any = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const { processBolWithFirebase } = await import('@/lib/firebase-client');

          setProgress(`Processing with Firebase Functions (attempt ${attempt + 1}/${maxRetries + 1})...`);

          extractedDocument = await processBolWithFirebase({
            fileContent: base64Content,
            fileName: file.name,
            fileType: file.type,
            clientId: clientId
          });

          setProgress('Processing complete!');
          break; // Success — exit retry loop
        } catch (error: any) {
          console.error(`Firebase attempt ${attempt + 1} failed:`, error);
          lastError = error;

          if (attempt < maxRetries) {
            const backoffTime = (attempt + 1) * 2000;
            setProgress(`Retrying in ${backoffTime / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
        }
      }

      if (!extractedDocument) {
        throw lastError || new Error('Failed to process document with Firebase');
      }

      // Step 2: Check for duplicate BOL
      if (extractedDocument.bolNumber) {
        const checkResponse = await fetch(`/api/documents/check-bol/${extractedDocument.bolNumber}`);
        const checkData = await checkResponse.json();

        if (checkData.exists) {
          setFileExists(true);
          setWarningMessage(`A document with BOL number ${extractedDocument.bolNumber} already exists.`);
          setWarningData(checkData);
          setDuplicateDocData(extractedDocument);
          setDuplicateDocId(checkData.document._id);
          setIsProcessing(false);
          return;
        }
      }

      // Step 3: Save file + extracted data via lightweight API (no processing, fast)
      setProgress('Saving document...');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientId', clientId);
      formData.append('extractedData', JSON.stringify({
        bolNumber: extractedDocument.bolNumber,
        shipmentDetails: extractedDocument.shipmentDetails,
        parties: extractedDocument.parties,
        containers: extractedDocument.containers,
        commercial: extractedDocument.commercial,
      }));

      const saveResponse = await fetch('/api/documents/save-bol', {
        method: 'POST',
        body: formData
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();

        if (errorData.duplicate) {
          setFileExists(true);
          setWarningMessage(`A document with BOL number ${extractedDocument.bolNumber} already exists.`);
          setWarningData({ exists: true, document: errorData.existingDocument });
          setDuplicateDocData(extractedDocument);
          setDuplicateDocId(errorData.existingDocument?._id || '');
          setIsProcessing(false);
          return;
        }

        throw new Error(errorData.error || 'Failed to save document');
      }

      // Success — redirect to client page
      showSuccessAndRedirect();

    } catch (error: any) {
      console.error('Document processing error:', error);

      const { errorType, userMessage, technicalDetails } = analyzeProcessingError(error);

      setUploadError(userMessage);
      setTechnicalError(technicalDetails);
      setErrorStatus(errorType);

      const diagnosticInfo = generateDiagnosticInfo(file, error);
      console.log('Document processing diagnostic information:', diagnosticInfo);

      setIsProcessing(false);
      setProgress('');
      setShowErrorDialog(true);
    }
  };

  // Helper function to read file as base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1];
        if (base64String) {
          resolve(base64String);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };
  
  // Modify the onFileChange function to prioritize Firebase
  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset any previous error state
    setApiKeyError(false);
    setUploadError('');

    // Store the file for later use in button handlers
    setCurrentFile(file)
    
    // Use Firebase for document processing
    processDocumentWithFirebase(file, clientId);
  }

  // Replace existing document: soft-delete old (set superseded) + save new via save-bol
  const handleReplaceExisting = async () => {
    if (!currentFile || !duplicateDocId || !duplicateDocData) {
      toast({
        title: 'Error',
        description: !currentFile
          ? 'The file is no longer available. Please try uploading again.'
          : 'No duplicate document data found.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsProcessing(true);

      // Step 1: Soft-delete the existing document (mark as superseded)
      setProgress('Marking existing document as superseded...');
      const supersededResponse = await fetch(`/api/documents/${duplicateDocId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'superseded' }),
      });

      if (!supersededResponse.ok) {
        console.warn('Could not mark existing document as superseded');
      }

      // Step 2: Save the new document via save-bol
      setProgress('Saving replacement document...');
      const formData = new FormData();
      formData.append('file', currentFile);
      formData.append('clientId', clientId);
      formData.append('extractedData', JSON.stringify({
        bolNumber: duplicateDocData.bolNumber,
        shipmentDetails: duplicateDocData.shipmentDetails,
        parties: duplicateDocData.parties,
        containers: duplicateDocData.containers,
        commercial: duplicateDocData.commercial,
      }));

      const saveResponse = await fetch('/api/documents/save-bol', {
        method: 'POST',
        body: formData
      });

      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        // If save-bol returns duplicate (because the old doc wasn't fully superseded yet),
        // that's expected — the BOL number check runs before status filter
        if (saveData.duplicate) {
          toast({
            title: 'Info',
            description: 'Document was already replaced.',
            variant: 'default',
          });
        } else {
          throw new Error(saveData.error || 'Failed to save replacement document');
        }
      }

      // Clear warning state and redirect
      setWarningMessage('');
      setWarningData(null);
      setFileExists(false);
      showSuccessAndRedirect();
    } catch (error) {
      console.error('Error replacing document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred while replacing the document.',
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
      } catch (error: any) { // Use 'any' type to access properties safely
        // ... existing error logic

        // Check if this is an API key error
        const errorDetail = error?.response?.data?.needsNewApiKey ||
                           (error?.message && error.message.includes('API key')) ||
                           (error?.message && error.message.includes('authentication'));

        if (errorDetail) {
          setApiKeyError(true);
          console.error('Anthropic API Key Error:', error?.response?.data?.message || 'Authentication failed');
        }
      }
    },
    [setApiKeyError] // Add the dependencies
  );

  // Add a function to detect and handle timeout errors
  const isTimeoutError = (error: any): boolean => {
    const errorMsg = error?.message || '';
    return (
      errorMsg.includes('FUNCTION_INVOCATION_TIMEOUT') ||
      errorMsg.includes('timed out') ||
      errorMsg.includes('timeout') ||
      error?.response?.status === 504
    );
  };

  // Add improved error handling with focus on Firebase
  const handleUploadError = (error: any) => {
    console.error('Upload error details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack?.substring(0, 200) // Limit stack trace length
    });

    if (!currentFile) {
      setUploadError('Upload failed: No file available');
      setShowErrorDialog(true);
      setIsProcessing(false);
      return;
    }

    // Use the utility function to analyze the error
    const { errorType, userMessage, technicalDetails } = analyzeProcessingError(error);

    setUploadError(userMessage);
    setTechnicalError(technicalDetails);
    setErrorStatus(errorType);

    // Generate and log diagnostic information
    const diagnosticInfo = generateDiagnosticInfo(currentFile, error);
    console.log('Upload error diagnostic information:', diagnosticInfo);

    setShowErrorDialog(true);
    setIsProcessing(false);
  };

  // Check for BOL number in URL (for debugging purposes)
  useEffect(() => {
    const url = new URL(window.location.href);
    const debug = url.searchParams.get('debug');
    if (debug === 'true') {
      setDebugMode(true);
    }
  }, []);

  // Function to manually trigger database cleanup for a specific BOL number
  const triggerCleanupForBol = async (bolNumber: string) => {
    if (!bolNumber) return;
    
    try {
      const response = await fetch('/api/documents/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cleanupFiles: true,
          documentType: 'BOL'
        })
      });
      
      const result = await response.json();
      console.log('Manual cleanup result:', result);
      toast({
        title: 'Database Cleanup Complete',
        description: result.message || `Cleaned up ${result.totalDeleted} items`,
      });
      
      // Re-check the BOL after cleanup
      if (bolNumber) {
        const checkResponse = await fetch(`/api/documents/check-bol/${bolNumber}`);
        const checkData = await checkResponse.json();
        console.log('Post-cleanup BOL check:', checkData);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      toast({
        title: 'Cleanup Failed',
        description: error instanceof Error ? error.message : 'An error occurred during cleanup',
        variant: 'destructive',
      });
    }
  };

  // Function to display debug information for a BOL number
  const showBolDebugInfo = async (bolNumber: string) => {
    if (!bolNumber) return;
    
    try {
      const checkResponse = await fetch(`/api/documents/check-bol/${bolNumber}`);
      const checkData = await checkResponse.json();
      console.log('BOL check details:', checkData);
      
      toast({
        title: 'BOL Check Results',
        description: (
          <div className="space-y-2 text-xs">
            <p>Exists: {checkData.exists ? 'Yes' : 'No'}</p>
            {checkData.document && (
              <>
                <p>ID: {checkData.document._id}</p>
                <p>File: {checkData.document.fileName}</p>
                <p>Client: {checkData.document.clientId}</p>
                <p>Created: {new Date(checkData.document.createdAt).toLocaleString()}</p>
              </>
            )}
            {checkData.message && <p>Message: {checkData.message}</p>}
          </div>
        ),
        duration: 10000,
      });
    } catch (error) {
      console.error('BOL check error:', error);
    }
  };

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

      {/* Error Dialog */}
      <BolUploadErrorDialog
        open={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        error={uploadError}
        technicalError={technicalError}
        status={errorStatus}
      />

      {apiKeyError ? (
        <div className="mb-6">
          <AnthropicApiError 
            message="The API key for Anthropic's Claude service appears to be invalid or expired. Document processing will not work until this is fixed."
            onRetry={() => setApiKeyError(false)}
          />
        </div>
      ) : null}

      {debugMode && warningData?.document?.bolNumber && (
        <div className="mt-4 p-2 border border-dashed rounded-lg">
          <p className="text-xs text-muted-foreground mb-2">Debug Tools</p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => showBolDebugInfo(warningData.document.bolNumber)}
            >
              Check BOL
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => triggerCleanupForBol(warningData.document.bolNumber)}
            >
              Manual Cleanup
            </Button>
          </div>
        </div>
      )}
    </>
  )
} 