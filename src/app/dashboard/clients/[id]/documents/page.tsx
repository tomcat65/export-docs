import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { Document as DocumentModel } from '@/models/Document'
import { Types } from 'mongoose'
import { ClientDocumentsWrapper } from '@/components/client-documents-wrapper'

// This interface should match what DocumentList expects
interface SerializedDocument {
  _id: string
  clientId: string
  fileName: string
  fileId: string
  type: 'BOL' | 'PL' | 'COO' | 'INVOICE_EXPORT' | 'INVOICE' | 'COA' | 'SED' | 'DATA_SHEET' | 'SAFETY_SHEET'
  relatedBolId?: string
  createdAt: string
  updatedAt: string
  bolData?: {
    bolNumber: string
    bookingNumber?: string
    shipper?: string
    carrierReference?: string
    vessel?: string
    voyage?: string
    portOfLoading?: string
    portOfDischarge?: string
    dateOfIssue?: string
    totalContainers?: string
    totalWeight?: {
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
  clientId: Types.ObjectId
  fileName: string
  fileId: Types.ObjectId
  type: 'BOL' | 'PL' | 'COO' | 'INVOICE_EXPORT' | 'INVOICE' | 'COA' | 'SED' | 'DATA_SHEET' | 'SAFETY_SHEET'
  relatedBolId?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
  bolData?: any
  packingListData?: any
  items?: any[]
}

interface MongoClient {
  _id: Types.ObjectId
  name: string
  rif: string
}

// Helper function to recursively convert ObjectIds to strings
function serializeObjectIds(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (obj instanceof Types.ObjectId) {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeObjectIds(item));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = serializeObjectIds(obj[key]);
      }
    }
    return result;
  }
  
  return obj;
}

async function getClientWithDocuments(id: string): Promise<SerializedClient | null> {
  await connectDB()
  
  const client = await Client.findById(id).lean() as MongoClient | null
  if (!client) return null

  const documents = await DocumentModel.find({ clientId: new Types.ObjectId(id) })
    .sort({ 'bolData.bolNumber': 1, createdAt: -1 })
    .lean() as unknown as MongoDocument[]

  // Serialize MongoDB documents
  const serializedDocuments = documents.map(doc => ({
    _id: doc._id.toString(),
    clientId: doc.clientId.toString(),
    fileName: doc.fileName,
    fileId: doc.fileId.toString(),
    type: doc.type,
    relatedBolId: doc.relatedBolId?.toString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    bolData: serializeObjectIds(doc.bolData),
    packingListData: serializeObjectIds(doc.packingListData),
    items: serializeObjectIds(doc.items)
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

  return <ClientDocumentsWrapper initialClient={client} />
}
