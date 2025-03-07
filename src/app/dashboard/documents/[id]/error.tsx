'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DocumentViewError } from '@/components/document-view-error'

interface ErrorDetails {
  message: string;
  code?: string;
  fileId?: string;
  fileName?: string;
  possibleFileId?: string;
  helpText?: string;
  documentId?: string;
}

export default function DocumentViewErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const params = useParams()
  const router = useRouter()
  const [errorDetails, setErrorDetails] = useState<ErrorDetails>({
    message: error.message || 'An error occurred while viewing the document',
  })
  
  // Try to parse error details from error message if it's JSON
  useEffect(() => {
    try {
      // Check if error message looks like JSON
      if (error.message.includes('{') && error.message.includes('}')) {
        // Extract the JSON part of the error message - using a regex that works in older JS versions
        const jsonMatch = error.message.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const errorJson = JSON.parse(jsonMatch[0]);
          if (errorJson.error && errorJson.documentId) {
            setErrorDetails({
              message: errorJson.error,
              helpText: errorJson.helpText,
              documentId: errorJson.documentId,
              fileId: errorJson.fileId,
              fileName: errorJson.fileName,
              possibleFileId: errorJson.possibleFileId,
              code: 'FILE_NOT_FOUND'
            });
            // Skip the additional fetch if we already have the details
            return;
          }
        }
      }
      
      // If not JSON or doesn't have the expected structure, proceed with fetch
      const fetchErrorDetails = async (): Promise<void> => {
        try {
          // Only fetch if this looks like a file not found error
          if (error.message.includes('not found') || error.message.includes('404')) {
            const response = await fetch(`/api/documents/${params.id}/exists`)
            const data = await response.json()
            
            if (!data.exists) {
              setErrorDetails({
                message: 'File not found',
                code: 'FILE_NOT_FOUND',
                fileId: data.fileId,
                fileName: data.fileName,
                possibleFileId: data.possibleFileId
              })
            }
          }
        } catch (err) {
          console.error('Error fetching additional error details:', err)
        }
      }
      
      fetchErrorDetails()
    } catch (err) {
      console.error('Error parsing error details:', err)
    }
  }, [error, params.id])
  
  const handleReturn = (): void => {
    router.back()
  }
  
  return (
    <div className="container py-8">
      <DocumentViewError
        documentId={errorDetails.documentId || params.id as string}
        error={errorDetails}
        onReturn={handleReturn}
      />
    </div>
  )
} 