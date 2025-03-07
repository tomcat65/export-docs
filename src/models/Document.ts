import mongoose from 'mongoose'

export interface IDocument {
  clientId: mongoose.Types.ObjectId
  fileName: string
  fileId: mongoose.Types.ObjectId  // GridFS file ID
  type: 'BOL' | 'PL' | 'COO'  // Adding COO type for Certificate of Origin
  relatedBolId?: mongoose.Types.ObjectId  // Reference to original BOL document
  packingListData?: {
    documentNumber: string  // e.g. "1092-PL"
    date: string           // e.g. "12/26/2024"
    poNumber?: string      // e.g. "key-2412-093"
    address: {
      company: string      // e.g. "Keystone CA"
      street: string      // e.g. "Zona Industrial III Carrera 2"
      details: string     // e.g. "esquina calle 4 Barquisimeto"
      location: string    // e.g. "Lara 3001"
      country: string     // e.g. "Venezuela"
    }
  }
  cooData?: {
    certificateNumber: string
    dateOfIssue: string
    exporterInfo: {
      name: string
      address: string
      taxId: string
    }
    importerInfo: {
      name: string
      address: string
      taxId: string
    }
    productInfo: Array<{
      description: string
      hsCode: string
      origin: string
      quantity: {
        value: number
        unit: string
      }
    }>
  }
  items?: Array<{
    itemNumber: number        // Sequential number
    containerNumber: string   // e.g. "MRKU8922059"
    seal: string             // e.g. "26787-26788"
    description: string      // e.g. "Base Oil Group II 600N"
    product: string          // e.g. "Base Oil Group II 600N"
    packaging: string        // e.g. "Flexitank"
    packagingQuantity: number // e.g. 1 for a flexitank, or 10 for 10 IBCs
    quantity: {
      litros: string         // e.g. "23,680"
      kg: string            // e.g. "20,729.17"
    }
  }>
  bolData?: {
    bolNumber: string
    bookingNumber?: string
    shipper: string
    carrierReference?: string
    vessel?: string
    voyage?: string
    portOfLoading: string
    portOfDischarge: string
    dateOfIssue?: string
    totalContainers: string
    totalWeight: {
      kg: string
      lbs: string
    }
  }
  createdAt: Date
  updatedAt: Date
}

const documentSchema = new mongoose.Schema<IDocument>({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  type: {
    type: String,
    enum: ['BOL', 'PL', 'COO'],
    required: true
  },
  relatedBolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: false
  },
  packingListData: {
    documentNumber: String,
    date: String,
    poNumber: String,
    address: {
      company: String,
      street: String,
      details: String,
      location: String,
      country: String
    }
  },
  cooData: {
    certificateNumber: String,
    dateOfIssue: String,
    exporterInfo: {
      name: String,
      address: String,
      taxId: String
    },
    importerInfo: {
      name: String,
      address: String,
      taxId: String
    },
    productInfo: [{
      description: String,
      hsCode: String,
      origin: String,
      quantity: {
        value: Number,
        unit: String
      }
    }]
  },
  items: [{
    itemNumber: Number,
    containerNumber: String,
    seal: String,
    description: String,
    product: String,
    packaging: String,
    packagingQuantity: Number,
    quantity: {
      litros: String,
      kg: String
    }
  }],
  bolData: {
    bolNumber: String,
    bookingNumber: String,
    shipper: String,
    carrierReference: String,
    vessel: String,
    voyage: String,
    portOfLoading: String,
    portOfDischarge: String,
    dateOfIssue: String,
    totalContainers: String,
    totalWeight: {
      kg: String,
      lbs: String
    }
  }
}, {
  timestamps: true
})

// Create indexes
documentSchema.index({ clientId: 1, type: 1 })
documentSchema.index({ 'bolData.bolNumber': 1 })
documentSchema.index({ relatedBolId: 1 })

export const Document = mongoose.models.Document || mongoose.model<IDocument>('Document', documentSchema) 