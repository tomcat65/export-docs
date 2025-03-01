'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Edit, Save, RefreshCw } from 'lucide-react'

interface PackingListDetails {
  documentNumber: string
  date: string
  poNumber?: string
}

interface PackingListEditorProps {
  documentId: string
  details: PackingListDetails
  onUpdate?: () => void
}

export function PackingListEditor({ documentId, details, onUpdate }: PackingListEditorProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<PackingListDetails>({
    documentNumber: details.documentNumber || '',
    date: details.date || '',
    poNumber: details.poNumber !== undefined && details.poNumber !== null ? String(details.poNumber) : ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    console.log(`Form field ${name} changed to: "${value}"`)
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const dataToSend = {
        documentNumber: formData.documentNumber,
        date: formData.date,
        poNumber: formData.poNumber !== undefined && formData.poNumber !== null ? String(formData.poNumber) : ''
      }
      
      console.log('Submitting data:', dataToSend)
      
      const response = await fetch(`/api/documents/${documentId}/update-details`, {
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

      const result = await response.json()
      
      toast({
        title: 'Success',
        description: result.message || 'Document details updated successfully',
      })

      // Close the dialog
      setIsOpen(false)
      
      // Trigger refresh if callback provided
      if (onUpdate) {
        onUpdate()
      }
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

  const handleRegeneratePdf = async () => {
    try {
      setIsSubmitting(true)
      
      const response = await fetch(`/api/documents/${documentId}/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to regenerate document')
      }

      const result = await response.json()
      
      toast({
        title: 'Success',
        description: result.message || 'Document regenerated successfully',
      })

      // Open the document in a new tab if available
      if (result.document?.id) {
        window.open(`/api/documents/${result.document.id}/view`, '_blank')
      }
      
      // Trigger refresh if callback provided
      if (onUpdate) {
        onUpdate()
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to regenerate document',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Packing List Details</span>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Edit className="mr-2 h-4 w-4" />
                Edit Details
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Packing List Details</DialogTitle>
                <DialogDescription>
                  Update the document number, date, or PO number for this packing list.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
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
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardTitle>
        <CardDescription>
          Review and edit the details of this packing list document
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Document Number:</span>
            <span>{details.documentNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Date:</span>
            <span>{details.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">PO Number:</span>
            <span>{details.poNumber || '—'}</span>
          </div>
          
          <div className="mt-4 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={handleRegeneratePdf}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate PDF with Updated Details
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 