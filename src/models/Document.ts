import mongoose, { Model } from 'mongoose'

interface IDocument {
  clientId: mongoose.Types.ObjectId
  fileName: string
  filePath: string
  fileUrl: string
  type: 'BOL' | 'PL'  // Adding PL type for Packing List
  packingListData?: {
    documentNumber: string  // e.g. "1092-PL"
    date: string           // e.g. "12/26/2024"
    address: {
      company: string      // e.g. "Keystone CA"
      street: string      // e.g. "Zona Industrial III Carrera 2"
      details: string     // e.g. "esquina calle 4 Barquisimeto"
      location: string    // e.g. "Lara 3001"
      country: string     // e.g. "Venezuela"
    }
  }
  items: Array<{
    itemNumber: number        // Sequential number
    containerNumber: string   // e.g. "MRKU8922059"
    seal: string             // e.g. "26787-26788"
    description: string      // e.g. "Base Oil Group II 600N"
    quantity: {
      litros: string         // e.g. "23,680"
      kg: string            // e.g. "20,729.17"
    }
  }>
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
  filePath: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['BOL', 'PL']
  },
  packingListData: {
    type: {
      documentNumber: String,
      date: String,
      address: {
        company: String,
        street: String,
        details: String,
        location: String,
        country: String
      }
    },
    required: false
  },
  items: {
    type: [{
      _id: false,
      itemNumber: { type: Number, required: true },
      containerNumber: { type: String, required: true },
      seal: { type: String, default: '' },
      description: { type: String, required: true },
      quantity: {
        litros: { type: String, required: true },
        kg: { type: String, required: true }
      }
    }],
    required: true,
    default: []
  },
  bolData: {
    type: {
      bolNumber: { type: String, required: true },
      bookingNumber: String,
      shipper: { type: String, required: true },
      vessel: String,
      portOfLoading: { type: String, required: true },
      portOfDischarge: { type: String, required: true },
      dateOfIssue: String,
      totalContainers: { type: String, required: true },
      totalWeight: {
        kg: { type: String, required: true },
        lbs: { type: String, required: true }
      }
    },
    required: false
  }
}, {
  timestamps: true,
  strict: true,
  strictQuery: true // Add this to ensure strict querying
})

// Force schema to be strict and remove any fields not in the schema
documentSchema.set('strict', true)

// Update the updatedAt timestamp before saving
documentSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

// Clear the model from mongoose's model cache
mongoose.deleteModel(/Document/)

// Create a new model with the updated schema
const DocumentModel = mongoose.model<IDocument>('Document', documentSchema)

export { DocumentModel as Document } 