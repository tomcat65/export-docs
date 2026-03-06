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

  // Add a function to use our direct API endpoint when Firebase isn't available
  const processDocumentWithAPI = async (file: File, clientId: string) => {
    try {
      setIsProcessing(true);
      setProgress('Reading file...');
      
      // Check file size and type
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('File too large. Please upload a file smaller than 10MB.');
      }
      
      if (!file.type.includes('pdf') && !file.type.includes('image')) {
        throw new Error('Invalid file type. Only PDF and image files are supported.');
      }
      
      // Convert file to base64
      const base64Content = await readFileAsBase64(file);
      
      setProgress('Processing with API...');
      
      // Call our direct API endpoint
      const response = await fetch('/api/documents/process-bol', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileContent: base64Content,
          fileName: file.name,
          fileType: file.type,
          clientId
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process document');
      }
      
      const data = await response.json();
      
      setProgress('Processing complete!');
      
      // Check for duplicate document
      if (data.document.bolNumber) {
        console.log(`Checking if BOL number ${data.document.bolNumber} exists...`);
        const checkResponse = await fetch(`/api/documents/check-bol/${data.document.bolNumber}`);
        const checkData = await checkResponse.json();
        
        console.log(`BOL check response:`, checkData);
        
        if (checkData.exists) {
          console.log(`BOL ${data.document.bolNumber} exists: ID=${checkData.document?._id}`);
          setFileExists(true);
          setWarningMessage(`A document with BOL number ${data.document.bolNumber} already exists.`);
          setWarningData(checkData);
          setDuplicateDocData(data.document);
          setDuplicateDocId(checkData.document?._id);
          setIsProcessing(false);
          return;
        } else {
          console.log(`BOL ${data.document.bolNumber} does not exist or was previously deleted`);
        }
      }
      
      // Upload to the regular document endpoint
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientId', clientId);
      formData.append('documentType', 'BOL');
      
      setProgress('Saving document...');
      
      const uploadResponse = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || 'Failed to upload document');
      }
      
      const uploadResult = await uploadResponse.json();
      
      // Show success message and redirect
      toast({
        title: 'Success',
        description: 'Document processed successfully',
        variant: 'default'
      });
      
      // Redirect to the document page
      router.push(`/dashboard/documents/${uploadResult.document._id}`);
    } catch (error: any) {
      console.error('Error processing document with API:', error);
      setUploadError(error.message || 'Failed to process document');
      setApiKeyError(error.message?.includes('API key') || false);
      setShowSkipOption(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // Modify the processDocumentWithFirebase function to try Firebase functions first, then fallback to direct API
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
      
      // Set up retry mechanism
      const maxRetries = 2;
      let retries = 0;
      let lastError = null;
      
      // Show a more detailed progress message if the file is large
      const fileSizeMB = Math.round(file.size / (1024 * 1024) * 10) / 10;
      if (fileSizeMB > 5) {
        setProgress(`Large file detected (${fileSizeMB}MB). Processing may take several minutes...`);
        
        // Add small delay to ensure the UI updates
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Try Firebase functions first
      let useDirectApi = false;
      while (retries <= maxRetries) {
        try {
          if (useDirectApi) {
            // Try the direct API endpoint if Firebase function failed
            setProgress(`Trying direct API processing (attempt ${retries + 1}/${maxRetries + 1})...`);
            
            // Call the direct API endpoint
            const response = await fetch('/api/documents/process-bol', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fileContent: base64Content,
                fileName: file.name,
                fileType: file.type,
                clientId
              })
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'API processing failed');
            }
            
            const apiResult = await response.json();
            
            if (apiResult.fallback) {
              setProgress('Processing complete with limited data (fallback mode)');
            } else {
              setProgress('Processing complete!');
            }
            
            // Check for duplicate
            if (apiResult.duplicate) {
              console.log(`Firebase detected duplicate BOL: ${apiResult.existingDocument.bolNumber}`);
              
              // Double-check with our enhanced check-bol endpoint
              if (apiResult.existingDocument.bolNumber) {
                const checkResponse = await fetch(`/api/documents/check-bol/${apiResult.existingDocument.bolNumber}`);
                const checkData = await checkResponse.json();
                console.log('Verification check response:', checkData);
                
                // Only treat as duplicate if verified by the enhanced check
                if (checkData.exists) {
                  setFileExists(true);
                  setWarningMessage(`A document with BOL number ${apiResult.existingDocument.bolNumber} already exists.`);
                  setWarningData({ exists: true, document: apiResult.existingDocument });
                  setIsProcessing(false);
                  return;
                } else {
                  console.log('Duplicate not verified by enhanced check, proceeding with upload...');
                  // Continue with upload since the duplicate wasn't verified
                }
              } else {
                // Fallback to old behavior if no BOL number
                setFileExists(true);
                setWarningMessage(`A document with this BOL number already exists.`);
                setWarningData({ exists: true, document: apiResult.existingDocument });
                setIsProcessing(false);
                return;
              }
            }
            
            // Refresh to show the new document
            setProgress('Document saved successfully');
            router.refresh();
            
            // Reset state after a short delay
            setTimeout(() => {
              setIsProcessing(false);
              setProgress('');
            }, 2000);
            
            return;
          } else {
            // Import the Firebase client dynamically to avoid SSR issues
            const { processBolWithFirebase } = await import('@/lib/firebase-client');
            
            setProgress(`Processing with Firebase Functions (attempt ${retries + 1}/${maxRetries + 1})...`);
            
            // Process the document with Firebase
            const result = await processBolWithFirebase({
              fileContent: base64Content,
              fileName: file.name,
              fileType: file.type,
              clientId: clientId
            });

            // Type the result properly
            const typedResult = result as {
              success: boolean;
              fallback?: boolean;
              document: {
                bolNumber: string;
                fileName: string;
                fileUrl: string;
                clientId: string;
                shipmentDetails: any;
                parties: any;
                containers: any;
                commercial: any;
              }
            };
            
            if (typedResult.fallback) {
              setProgress('Processing complete with limited data (fallback mode)');
            } else {
              setProgress('Processing complete!');
            }
            
            // Check for duplicate document
            if (typedResult.document?.bolNumber) {
              const checkResponse = await fetch(`/api/documents/check-bol/${typedResult.document.bolNumber}`);
              const checkData = await checkResponse.json();
              
              if (checkData.exists) {
                setFileExists(true);
                setWarningMessage(`A document with BOL number ${typedResult.document.bolNumber} already exists.`);
                setWarningData(checkData);
                setDuplicateDocData(typedResult.document);
                setDuplicateDocId(checkData.document._id);
                setIsProcessing(false);
                return;
              }
            }
            
            // Upload to the regular document endpoint
            const formData = new FormData();
            formData.append('file', file);
            formData.append('clientId', clientId);
            formData.append('documentType', 'BOL');
            
            // We only include the BOL number if we have it (could be fallback mode)
            if (typedResult.document?.bolNumber) {
              formData.append('bolNumber', typedResult.document.bolNumber);
            }
            
            setProgress('Saving document...');
            
            const uploadResponse = await fetch('/api/documents/upload', {
              method: 'POST',
              body: formData
            });
            
            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              
              // If we get a duplicate error here, handle it specially
              if (errorData.error?.includes('duplicate')) {
                const bolNumber = typedResult.document?.bolNumber || 'unknown';
                setFileExists(true);
                setWarningMessage(`A document with BOL number ${bolNumber} already exists.`);
                setWarningData({
                  exists: true,
                  document: { bolNumber }
                });
                setIsProcessing(false);
                return;
              }
              
              throw new Error(errorData.error || 'Failed to upload processed document');
            }
            
            // Success!
            setProgress('Document saved successfully');
            router.refresh();
            
            // Reset state after a short delay
            setTimeout(() => {
              setIsProcessing(false);
              setProgress('');
            }, 2000);
            
            return;
          }
        } catch (error: any) {
          console.error(`Attempt ${retries + 1} failed:`, error);
          setProgress(`Error in attempt ${retries + 1}: ${error.message}`);
          lastError = error;
          
          // If this was a Firebase attempt and it failed, try direct API next
          if (!useDirectApi) {
            useDirectApi = true;
            setProgress('Firebase processing failed, trying direct API...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; // Skip the retry counter increment to try the API method
          }
          
          // If this isn't the last attempt, wait before retrying
          if (retries < maxRetries) {
            const backoffTime = (retries + 1) * 2000;
            setProgress(`Retrying in ${backoffTime/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
          
          retries++;
        }
      }
      
      // If we reached here, all retries failed
      throw lastError || new Error('Failed to process document after multiple attempts');
    } catch (error: any) {
      console.error('Document processing error:', error);
      
      // Use the utility function to analyze the error
      const { errorType, userMessage, technicalDetails } = analyzeProcessingError(error);
      
      setUploadError(userMessage);
      setTechnicalError(technicalDetails);
      setErrorStatus(errorType);
      
      // Generate and log diagnostic information
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
      
      // First, explicitly delete the existing document
      console.log('Deleting existing document before replacement:', duplicateDocId);
      setProgress('Deleting existing document...');
      
      const deleteResponse = await fetch(`/api/documents/${duplicateDocId}`, {
        method: 'DELETE',
      });
      
      if (!deleteResponse.ok) {
        const deleteError = await deleteResponse.json();
        console.warn('Warning: Could not delete existing document:', deleteError.error || 'Unknown error');
        // Continue anyway, as we might be dealing with a document that doesn't exist in the database
      } else {
        const deleteResult = await deleteResponse.json();
        console.log('Document deletion result:', deleteResult);
        
        // Add a small delay to ensure the deletion is processed
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Now, read the file as base64 to include the data
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