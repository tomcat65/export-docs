'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'

export default function EditFieldPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const id = params.id as string
  
  const [document, setDocument] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [fieldPath, setFieldPath] = useState('')
  const [fieldValue, setFieldValue] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    async function fetchDocument() {
      if (!id) return
      
      try {
        setLoading(true)
        const response = await fetch(`/api/documents/${id}/get`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch document')
        }
        
        const data = await response.json()
        setDocument(data.document)
        
        // Set default field to carrierReference if it's available
        if (data.document?.bolData) {
          setFieldPath('bolData.carrierReference')
          setFieldValue(data.document.bolData.carrierReference || '')
        }
      } catch (error) {
        console.error('Error fetching document:', error)
        toast({
          title: 'Error',
          description: 'Failed to fetch document details',
          variant: 'destructive'
        })
      } finally {
        setLoading(false)
      }
    }

    fetchDocument()
  }, [id, toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!fieldPath) {
      toast({
        title: 'Error',
        description: 'Please specify a field path',
        variant: 'destructive'
      })
      return
    }
    
    setUpdating(true)
    
    try {
      const response = await fetch(`/api/documents/${id}/edit-field`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fieldPath,
          value: fieldValue
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        toast({
          title: 'Success',
          description: `Field '${fieldPath}' updated successfully`
        })
        
        setTimeout(() => {
          router.push(`/dashboard/clients/${document.clientId}/documents`)
        }, 1500)
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update field',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error updating field:', error)
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      })
    } finally {
      setUpdating(false)
    }
  }

  // Preset field options
  const commonFields = [
    { label: "Carrier's Reference", value: "bolData.carrierReference" },
    { label: "Booking Number", value: "bolData.bookingNumber" },
    { label: "Vessel Name", value: "bolData.vessel" },
    { label: "Voyage", value: "bolData.voyage" },
    { label: "Date of Issue", value: "bolData.dateOfIssue" }
  ]

  return (
    <div className="container mx-auto py-8">
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => router.back()}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
      
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Edit Document Field</CardTitle>
          <CardDescription>
            {loading ? 'Loading document...' : `Editing document: ${document?.bolData?.bolNumber || id}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center">Loading...</div>
          ) : (
            <>
              <div className="mb-6">
                <h3 className="text-sm font-medium mb-2">Quick Field Selection</h3>
                <div className="flex flex-wrap gap-2">
                  {commonFields.map(field => (
                    <Button
                      key={field.value}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFieldPath(field.value)
                        setFieldValue(
                          field.value.split('.').reduce((obj, key) => 
                            obj && typeof obj === 'object' ? (obj as any)[key] : undefined, 
                            document
                          ) || ''
                        )
                      }}
                    >
                      {field.label}
                    </Button>
                  ))}
                </div>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fieldPath">Field Path</Label>
                  <Input
                    id="fieldPath"
                    value={fieldPath}
                    onChange={(e) => setFieldPath(e.target.value)}
                    placeholder="e.g., bolData.carrierReference"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fieldValue">Field Value</Label>
                  <Input
                    id="fieldValue"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    placeholder="Enter new value"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={updating}>
                  {updating ? 'Updating...' : 'Update Field'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 