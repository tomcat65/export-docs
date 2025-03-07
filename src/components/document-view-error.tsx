'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useState } from "react"
import { toast } from "@/components/ui/use-toast"
import { Loader2 } from "lucide-react"

interface DocumentViewErrorProps {
  documentId: string
  error: {
    message: string
    code?: string
    possibleFileId?: string
    fileId?: string
    fileName?: string
    helpText?: string
  }
  onReturn?: () => void
}

export function DocumentViewError({ documentId, error, onReturn }: DocumentViewErrorProps) {
  const [isRepairing, setIsRepairing] = useState(false)
  const [repaired, setRepaired] = useState(false)
  const [repairResult, setRepairResult] = useState<{
    success: boolean
    repaired?: boolean
    message?: string
    oldFileId?: string
    newFileId?: string
  } | null>(null)

  const handleRepair = async (): Promise<void> => {
    try {
      setIsRepairing(true)
      
      // If we have a possibleFileId, include it in the request
      const requestBody = error.possibleFileId ? { possibleFileId: error.possibleFileId } : {};
      
      const response = await fetch(`/api/documents/${documentId}/repair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      const result = await response.json()
      setRepairResult(result)
      
      if (result.success && result.repaired) {
        setRepaired(true)
        toast({
          title: 'Document Repaired',
          description: 'The document record has been repaired and can now be viewed.',
          variant: 'default'
        })
      } else if (result.success && !result.repaired) {
        toast({
          title: 'No Repair Needed',
          description: result.message,
          variant: 'default'
        })
      } else {
        toast({
          title: 'Repair Failed',
          description: result.message || 'Could not repair the document record.',
          variant: 'destructive'
        })
      }
    } catch (err) {
      console.error('Error repairing document:', err)
      toast({
        title: 'Error',
        description: 'Failed to repair document. See console for details.',
        variant: 'destructive'
      })
    } finally {
      setIsRepairing(false)
    }
  }
  
  const handleViewDocument = (): void => {
    window.open(`/api/documents/${documentId}/view`, '_blank')
  }
  
  const renderActions = () => {
    if (repaired) {
      return (
        <Button onClick={handleViewDocument}>
          View Document
        </Button>
      )
    }
    
    return (
      <div className="flex flex-wrap gap-3">
        <Button 
          variant="default" 
          onClick={handleRepair} 
          disabled={isRepairing}
        >
          {isRepairing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Repairing...
            </>
          ) : 'Repair Document'}
        </Button>
        
        {onReturn && (
          <Button 
            variant="outline" 
            onClick={onReturn}
          >
            Return
          </Button>
        )}
      </div>
    )
  }

  const renderRepairResult = () => {
    if (!repairResult) return null;
    
    if (repairResult.success && repairResult.repaired) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 mt-4">
          <p className="font-medium text-green-800">Repair Successful!</p>
          <p className="text-sm text-green-700">
            The document has been repaired and can now be viewed.
          </p>
          {repairResult.oldFileId && repairResult.newFileId && (
            <div className="mt-2 text-xs text-green-600">
              <p>Old File ID: {repairResult.oldFileId}</p>
              <p>New File ID: {repairResult.newFileId}</p>
            </div>
          )}
        </div>
      );
    } else if (repairResult.success && !repairResult.repaired) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mt-4">
          <p className="font-medium text-blue-800">No Repair Needed</p>
          <p className="text-sm text-blue-700">
            {repairResult.message || 'The document does not need to be repaired.'}
          </p>
        </div>
      );
    } else {
      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mt-4">
          <p className="font-medium text-red-800">Repair Failed</p>
          <p className="text-sm text-red-700">
            {repairResult.message || 'Could not repair the document record.'}
          </p>
        </div>
      );
    }
  };

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="text-destructive">Document Error</CardTitle>
        <CardDescription>
          There was a problem viewing this document
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-destructive/15 p-4">
          <p className="text-destructive font-medium mb-2">
            {error.message || 'The document could not be displayed'}
          </p>
          
          <p className="text-sm text-muted-foreground">
            {error.helpText || 'The document record exists in the database, but the associated file could not be found. This could happen if the file was deleted or if the file ID reference is incorrect.'}
          </p>
          
          {error.fileName && (
            <p className="text-sm mt-2">
              <span className="font-medium">Document name:</span> {error.fileName}
            </p>
          )}
          
          {error.fileId && (
            <p className="text-sm">
              <span className="font-medium">Referenced file ID:</span> {error.fileId}
            </p>
          )}
          
          {error.possibleFileId && (
            <p className="text-sm text-green-600">
              <span className="font-medium">Found a file with matching name! Possible file ID:</span> {error.possibleFileId}
            </p>
          )}
        </div>
        
        {error.possibleFileId ? (
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <p className="font-medium text-green-800">Good news!</p>
            <p className="text-sm text-green-700">
              We found a file with the same name. You can try to repair the document record to point to this file.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <p className="font-medium text-amber-800">No matching files found</p>
            <p className="text-sm text-amber-700">
              We couldn't find a file with the same name. You might need to upload the document again.
            </p>
          </div>
        )}
        
        {renderRepairResult()}
      </CardContent>
      <CardFooter>
        {renderActions()}
      </CardFooter>
    </Card>
  )
} 