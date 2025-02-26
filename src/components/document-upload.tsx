'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Upload, Loader2 } from 'lucide-react'

interface DocumentUploadProps {
  clientId: string
}

export function DocumentUpload({ clientId }: DocumentUploadProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState('')

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

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
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Create form data with file and document data
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document', JSON.stringify({
        type: isPDF ? 'pdf' : 'image',
        data: base64Data
      }))

      setProgress('Analyzing document...')
      // Upload and process document
      const response = await fetch(`/api/clients/${clientId}/documents/upload`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to upload document')
      }

      toast({
        title: 'Success',
        description: 'Document uploaded and processed successfully'
      })

      router.refresh()
      router.push(`/dashboard/clients/${clientId}/documents`)
    } catch (error) {
      console.error('Error processing document:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process document',
        variant: 'destructive'
      })
    } finally {
      setIsProcessing(false)
      setProgress('')
      // Reset the file input
      event.target.value = ''
    }
  }

  return (
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
  )
} 