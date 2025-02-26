import { notFound } from 'next/navigation'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { Document } from '@/models/Document'
import { Button } from '@/components/ui/button'
import { DocumentList } from '@/components/document-list'
import { ArrowLeft } from 'lucide-react'
import { Types } from 'mongoose'

interface SerializedDocument {
  id: string
  fileName: string
  type: string
  createdAt: string
  bolData?: {
    bolNumber: string
    bookingNumber?: string
    shipper: string
    vessel?: string
    portOfLoading: string
    portOfDischarge: string
    dateOfIssue?: string
    totalContainers: string
    totalWeight: {
      kg: string
      lbs: string
    }
  }
  packingListData?: {
    documentNumber: string
    date: string
    address: {
      company: string
      street: string
      details: string
      location: string
      country: string
    }
  }
  items?: Array<{
    itemNumber: number
    containerNumber: string
    seal: string
    description: string
    quantity: {
      litros: string
      kg: string
    }
  }>
}

interface SerializedClient {
  id: string
  name: string
  rif: string
  documents: SerializedDocument[]
}

interface MongoDocument {
  _id: Types.ObjectId
  fileName: string
  type: string
  createdAt: Date
  bolData?: {
    bolNumber: string
    bookingNumber?: string
    shipper: string
    vessel?: string
    portOfLoading: string
    portOfDischarge: string
    dateOfIssue?: string
    totalContainers: string
    totalWeight: {
      kg: string
      lbs: string
    }
  }
  packingListData?: {
    documentNumber: string
    date: string
    address: {
      company: string
      street: string
      details: string
      location: string
      country: string
    }
  }
  items?: Array<{
    itemNumber: number
    containerNumber: string
    seal: string
    description: string
    quantity: {
      litros: string
      kg: string
    }
  }>
}

interface MongoClient {
  _id: Types.ObjectId
  name: string
  rif: string
}

async function getClientWithDocuments(id: string): Promise<SerializedClient | null> {
  await connectDB()
  
  const client = await Client.findById(id).lean() as MongoClient | null
  if (!client) return null

  const documents = await Document.find({ clientId: new Types.ObjectId(id) })
    .sort({ 'bolData.bolNumber': 1, createdAt: -1 })
    .lean() as MongoDocument[]

  // Serialize MongoDB documents
  const serializedDocuments = documents.map(doc => ({
    id: doc._id.toString(),
    fileName: doc.fileName,
    type: doc.type,
    createdAt: doc.createdAt.toISOString(),
    bolData: doc.bolData ? {
      ...doc.bolData,
      _id: undefined // Remove _id from nested objects
    } : undefined,
    packingListData: doc.packingListData ? {
      ...doc.packingListData,
      _id: undefined // Remove _id from nested objects
    } : undefined,
    items: doc.items?.map(item => ({
      ...item,
      _id: undefined // Remove _id from array items
    }))
  }))

  return {
    id: client._id.toString(),
    name: client.name,
    rif: client.rif,
    documents: serializedDocuments
  }
}

export default async function ClientDocumentsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  // Await the params
  const { id } = await params
  const client = await getClientWithDocuments(id)
  if (!client) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/clients">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">{client.name}</h1>
              <p className="text-muted-foreground">RIF: {client.rif}</p>
            </div>
          </div>
        </div>
      </div>

      <DocumentList documents={client.documents} />
    </div>
  )
} 