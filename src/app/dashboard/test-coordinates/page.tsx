'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, RefreshCw } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Checkbox } from '@/components/ui/checkbox'

export default function TestCoordinatesPage() {
  const { toast } = useToast()
  const [documentId, setDocumentId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  
  // Coordinates for the top-right section
  const [topRightCoords, setTopRightCoords] = useState({
    // Main section properties
    sectionX: 345,
    sectionY: 635,
    sectionWidth: 160,
    sectionHeight: 80,
    
    // Title coordinates
    titleX: 348,
    titleY: 632,
    
    // Document number field
    docNumLabelX: 348,
    docNumLabelY: 612,
    docNumValueX: 430,
    docNumValueY: 612,
    
    // Date field
    dateLabelX: 348,
    dateLabelY: 592,
    dateValueX: 430,
    dateValueY: 587,
    
    // PO Number field
    poNumLabelX: 348,
    poNumLabelY: 572,
    poNumValueX: 430,
    poNumValueY: 572,
    poNumLineEndX: 518
  })
  
  // Coordinates for clearing the original section
  const [originalSectionCoords, setOriginalSectionCoords] = useState({
    sectionX: 350,
    sectionY: 650,
    sectionWidth: 170,
    sectionHeight: 80
  })
  
  const handleTopRightChange = (field: string, value: string) => {
    const numValue = parseInt(value)
    if (!isNaN(numValue)) {
      setTopRightCoords(prev => ({
        ...prev,
        [field]: numValue
      }))
    }
  }
  
  const handleOriginalSectionChange = (field: string, value: string) => {
    const numValue = parseInt(value)
    if (!isNaN(numValue)) {
      setOriginalSectionCoords(prev => ({
        ...prev,
        [field]: numValue
      }))
    }
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!documentId) {
      toast({
        title: 'Error',
        description: 'Please enter a document ID',
        variant: 'destructive'
      })
      return
    }
    
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/documents/test-coordinates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId,
          coordinates: {
            topRight: topRightCoords,
            original: originalSectionCoords
          },
          debug: debugMode
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to test coordinates')
      }
      
      const data = await response.json()
      
      toast({
        title: 'Success',
        description: 'Document regenerated with custom coordinates'
      })
      
      // Open the document in a new tab
      if (data.result?.document?.id) {
        window.open(`/api/documents/${data.result.document.id}/view`, '_blank')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to test coordinates',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Test Document Coordinates</h1>
      
      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Document Information</CardTitle>
            <CardDescription>
              Enter the ID of the document to regenerate with custom coordinates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="documentId">Document ID</Label>
                <Input
                  id="documentId"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  placeholder="Enter document ID"
                  required
                />
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <Checkbox 
                  id="debugMode" 
                  checked={debugMode} 
                  onCheckedChange={(checked: boolean | "indeterminate") => setDebugMode(checked === true)} 
                />
                <Label 
                  htmlFor="debugMode" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Enable debug mode (adds a small indicator in the PDF)
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Top-Right Document Details Section</CardTitle>
              <CardDescription>
                Adjust coordinates for top-right section
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(topRightCoords).map(([key, value]) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`tr-${key}`}>{key}</Label>
                    <Input
                      id={`tr-${key}`}
                      type="number"
                      value={value}
                      onChange={(e) => handleTopRightChange(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Original Section Clearing</CardTitle>
              <CardDescription>
                Adjust coordinates to clear the original section
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(originalSectionCoords).map(([key, value]) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`orig-${key}`}>{key}</Label>
                    <Input
                      id={`orig-${key}`}
                      type="number"
                      value={value}
                      onChange={(e) => handleOriginalSectionChange(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardFooter className="pt-6">
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate with Custom Coordinates
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
} 