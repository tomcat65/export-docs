'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'

export default function DebugCarrierReferencePage() {
  const [documentId, setDocumentId] = useState('')
  const [carrierReference, setCarrierReference] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!documentId || !carrierReference) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive'
      })
      return
    }
    
    setIsLoading(true)
    
    try {
      const response = await fetch(`/api/documents/${documentId}/update-carrier-ref`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ carrierReference })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Carrier reference updated successfully'
        })
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update carrier reference',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error updating carrier reference:', error)
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleUpdate = async () => {
    try {
      const response = await fetch(`/api/debug/force-carrier-ref`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bolNumber: 'HLCUBSC250265371', carrierReference: '18763708' })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: `Updated ${data.count} documents`
        })
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update documents',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="container mx-auto py-8">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Debug Carrier Reference</CardTitle>
          <CardDescription>Fix carrier reference display issues</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="documentId">Document ID</Label>
              <Input
                id="documentId"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                placeholder="Enter document ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrierReference">Carrier Reference</Label>
              <Input
                id="carrierReference"
                value={carrierReference}
                onChange={(e) => setCarrierReference(e.target.value)}
                placeholder="Enter carrier reference"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update Carrier Reference'}
            </Button>
          </form>
          
          <div className="mt-8 pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">Quick Fix</h3>
            <Button variant="outline" className="w-full" onClick={handleUpdate}>
              Fix HLCUBSC250265371 Carrier Reference
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 