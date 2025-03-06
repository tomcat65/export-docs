import { useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Download, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DocumentIcon } from '@/components/DocumentIcon'
import { Document } from '@/models/Document'
import { formatDate } from '@/lib/utils'

interface DocumentListProps {
  documents: Document[]
  clientId?: string
  onUpload?: (document: Document) => void
  onDelete?: (document: Document) => void
  onRegenerate?: (document: Document) => void
}

export function DocumentList({ documents, clientId, onUpload, onDelete, onRegenerate }: DocumentListProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: session } = useSession()

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadError(null)

    try {
      // First, try to extract BOL number from the file name
      const bolNumberMatch = file.name.match(/(\d{9})/)?.[1] // Assuming BOL numbers are 9 digits
      if (!bolNumberMatch) {
        throw new Error('Could not find BOL number in filename. Expected format: MDRA0101_123456789.pdf')
      }

      if (!clientId) {
        throw new Error('No client selected')
      }

      // Create form data
      const formData = new FormData()
      formData.append('file', file)
      formData.append('clientId', clientId)
      
      // First, validate the BOL number and format
      const validateResponse = await fetch('/api/documents/validate-bol', {
        method: 'POST',
        body: formData
      })

      if (!validateResponse.ok) {
        const error = await validateResponse.json()
        throw new Error(error.error || 'Failed to validate BOL')
      }

      // If validation passed, upload the file and process with Claude
      const uploadFormData = new FormData()
      uploadFormData.append('file', file)
      uploadFormData.append('clientId', clientId)
      uploadFormData.append('bolNumber', bolNumberMatch)

      const uploadResponse = await fetch('/api/documents/upload', {
        method: 'POST',
        body: uploadFormData
      })

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json()
        throw new Error(error.error || 'Failed to upload BOL')
      }

      const uploadResult = await uploadResponse.json()

      // If everything is successful, call onUpload
      if (onUpload && uploadResult.document) {
        onUpload(uploadResult.document)
      }

      // Clear the file input
      event.target.value = ''
    } catch (error) {
      console.error('Error uploading file:', error)
      setUploadError(error instanceof Error ? error.message : 'Failed to upload file')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {session?.user?.isAdmin && (
        <div className="flex items-center gap-4 p-4 bg-background/95 border rounded-lg">
          <Input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            ref={fileInputRef}
            disabled={isUploading}
          />
          {isUploading && <Loader2 className="animate-spin" />}
        </div>
      )}
      
      {uploadError && (
        <div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg">
          {uploadError}
        </div>
      )}

      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc._id}
            className="flex items-center justify-between p-4 bg-background/95 border rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <DocumentIcon type={doc.type} />
                <span className="font-medium truncate">{doc.fileName}</span>
              </div>
              
              {/* Display BOL date if available */}
              {doc.type === 'BOL' && doc.bolData?.dateOfIssue && (
                <div className="mt-1 text-sm text-muted-foreground">
                  Date of Issue: {formatDate(doc.bolData.dateOfIssue)}
                </div>
              )}
              
              {/* Display related BOL info for COO and PL */}
              {(doc.type === 'COO' || doc.type === 'PL') && doc.relatedBolId && (
                <div className="mt-1 text-sm text-muted-foreground">
                  Related BOL: {doc.relatedBolNumber || 'Unknown'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(`/api/documents/${doc._id}/download`, '_blank')}
              >
                <Download className="h-4 w-4" />
              </Button>

              {session?.user?.isAdmin && doc.type !== 'BOL' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRegenerate?.(doc)}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}

              {session?.user?.isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => onDelete?.(doc)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 