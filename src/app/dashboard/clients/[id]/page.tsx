'use client'

import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { use } from 'react'

interface Client {
  _id: string
  name: string
  rif: string
  address: string
  contact: {
    name: string
    email: string
    phone: string
  }
  requiredDocuments: string[]
}

const documentTypes = ['COO', 'COA', 'Invoice', 'PackingList', 'SED']

export default function ClientDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])

  useEffect(() => {
    console.log('Fetching client data...')
    fetch(`/api/clients/${resolvedParams.id}`)
      .then(res => {
        console.log('Response status:', res.status)
        if (!res.ok) throw new Error('Client not found')
        return res.json()
      })
      .then(data => {
        console.log('Received client data:', data)
        setClient(data)
        setSelectedDocs(data.requiredDocuments || [])
        setLoading(false)
      })
      .catch(error => {
        console.error('Error fetching client:', error)
        setError('Failed to load client')
        setLoading(false)
      })
  }, [resolvedParams.id])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name'),
      rif: formData.get('rif'),
      address: formData.get('address'),
      contact: {
        name: formData.get('contactName'),
        email: formData.get('contactEmail'),
        phone: formData.get('contactPhone')
      },
      requiredDocuments: selectedDocs
    }

    try {
      const response = await fetch(`/api/clients/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update client')
      }

      router.refresh()
      router.push('/dashboard')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Client not found</h3>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard')}
          className="mt-4"
        >
          Back to Dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Edit Client</h1>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard')}
        >
          Back
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Company Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              defaultValue={client.name}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="rif" className="block text-sm font-medium">
              RIF
            </label>
            <input
              type="text"
              id="rif"
              name="rif"
              defaultValue={client.rif}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium">
              Address
            </label>
            <textarea
              id="address"
              name="address"
              defaultValue={client.address}
              required
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Contact Information</h3>
            
            <div>
              <label htmlFor="contactName" className="block text-sm font-medium">
                Contact Name
              </label>
              <input
                type="text"
                id="contactName"
                name="contactName"
                defaultValue={client.contact?.name}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium">
                Contact Email
              </label>
              <input
                type="email"
                id="contactEmail"
                name="contactEmail"
                defaultValue={client.contact?.email}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium">
                Contact Phone
              </label>
              <input
                type="tel"
                id="contactPhone"
                name="contactPhone"
                defaultValue={client.contact?.phone}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Required Documents
            </label>
            <div className="space-y-2">
              {documentTypes.map((doc) => (
                <label key={doc} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedDocs.includes(doc)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDocs([...selectedDocs, doc])
                      } else {
                        setSelectedDocs(selectedDocs.filter(d => d !== doc))
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="ml-2">{doc}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={saving}
            className="flex-1"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
} 