'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'

interface Client {
  id: string
  name: string
  rif: string
}

interface BolUploadSectionProps {
  clients: Client[]
}

export function BolUploadSection({ clients }: BolUploadSectionProps) {
  const router = useRouter()
  const [selectedClient, setSelectedClient] = useState<string>('')

  const handleUpload = () => {
    if (!selectedClient) return
    router.push(`/dashboard/clients/${selectedClient}/upload`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Bill of Lading</CardTitle>
        <CardDescription>
          Select a client and upload their BOL documents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="flex h-10 w-[300px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} ({client.rif})
              </option>
            ))}
          </select>
          <Button onClick={handleUpload} disabled={!selectedClient}>
            <Upload className="mr-2 h-4 w-4" />
            Upload BOL
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 