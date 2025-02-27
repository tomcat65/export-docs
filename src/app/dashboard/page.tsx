import { ClientCard } from '@/components/client-card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { BolUploadSection } from '@/components/bol-upload-section'
import { Types } from 'mongoose'

interface MongoClient {
  _id: Types.ObjectId
  name: string
  rif: string
  address?: string
  contact?: Record<string, any>
  requiredDocuments?: any[]
  lastDocumentDate?: string
  createdAt: Date
  updatedAt: Date
  __v: number
}

async function getClients() {
  try {
    console.log('Connecting to database...')
    const conn = await connectDB()
    console.log('Database connection:', {
      readyState: conn.connection.readyState,
      name: conn.connection.name,
      host: conn.connection.host
    })
    
    console.log('Fetching clients...')
    const rawClients = await Client.find({})
    console.log('Raw find result:', rawClients)
    
    const clients = (await Client.find({}).lean().exec()) as unknown as MongoClient[]
    console.log('Processed clients:', JSON.stringify({
      count: clients.length,
      data: clients
    }, null, 2))
    
    if (!Array.isArray(clients)) {
      console.error('Expected clients to be an array but got:', typeof clients)
      return []
    }

    const mappedClients = clients.map(client => ({
      id: client._id.toString(),
      name: client.name,
      rif: client.rif,
      address: client.address,
      lastDocument: client.lastDocumentDate ? {
        date: client.lastDocumentDate,
        type: 'BOL'
      } : undefined
    }))

    console.log('Mapped clients:', JSON.stringify(mappedClients, null, 2))
    return mappedClients
  } catch (error) {
    console.error('Error fetching clients:', error)
    return []
  }
}

export default async function DashboardPage() {
  const clients = await getClients()

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link href="/dashboard/clients/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="text-center">
          <p className="text-muted-foreground">No clients found</p>
        </div>
      ) : (
        <div className="space-y-8">
          <BolUploadSection clients={clients} />

          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Clients</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 