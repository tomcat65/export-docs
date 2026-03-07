import mongoose from 'mongoose'

// Valid status values used across all routes
export const VALID_STATUSES = [
  'active', 'superseded', 'processing', 'processed',
  'duplicate', 'verification_failed', 'error'
] as const;

export type DocumentStatus = typeof VALID_STATUSES[number];

export interface IExtractedContainer {
  containerNumber?: string
  sealNumber?: string
  size?: string
  type?: string
  weight?: { kg?: string; lbs?: string }
  volume?: string
  packages?: string
  description?: string
  product?: {
    name?: string
    description?: string
    hsCode?: string
  }
  quantity?: {
    volume?: { liters?: number; gallons?: number }
    weight?: { kg?: number; lbs?: number; mt?: number }
  }
  [key: string]: any
}

export interface IExtractedParties {
  shipper?: { name?: string; address?: string; taxId?: string; [key: string]: any }
  consignee?: { name?: string; address?: string; taxId?: string; [key: string]: any }
  notifyParty?: { name?: string; address?: string; [key: string]: any }
  [key: string]: any
}

export interface IExtractedCommercial {
  currency?: string
  freightTerms?: string
  itnNumber?: string
  totalWeight?: { kg?: string; lbs?: string }
  [key: string]: any
}

export interface IExtractedData {
  containers?: IExtractedContainer[]
  parties?: IExtractedParties
  commercial?: IExtractedCommercial
  meta?: any  // Escape hatch for unexpected Claude output
}

export interface IDocument {
  clientId: mongoose.Types.ObjectId
  fileName: string
  fileId: mongoose.Types.ObjectId  // GridFS file ID
  type: 'BOL' | 'PL' | 'COO' | 'INVOICE_EXPORT' | 'INVOICE' | 'COA' | 'SED' | 'DATA_SHEET' | 'SAFETY_SHEET' | 'INSURANCE'  // Document types
  subType?: string  // Used to distinguish between different subtypes (e.g., 'EXPORT' for invoices)
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
  extractedData?: IExtractedData
  status?: DocumentStatus
  supersededBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// Valid document types constant that can be used across the application
export const VALID_DOCUMENT_TYPES = [
  'BOL', 'PL', 'COO', 'INVOICE_EXPORT', 'INVOICE', 'COA', 'SED',
  'DATA_SHEET', 'SAFETY_SHEET', 'INSURANCE'
] as const;

// Define the document schema
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
    enum: VALID_DOCUMENT_TYPES,
    required: true
  },
  subType: {
    type: String,
    required: false
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
  },
  extractedData: {
    containers: [{
      containerNumber: String,
      sealNumber: String,
      size: String,
      type: { type: String },
      weight: { kg: String, lbs: String },
      volume: String,
      packages: String,
      description: String,
      // New: structured line items per container
      lineItems: [{
        product: String,
        hsCode: String,
        packaging: String,
        packagingQuantity: Number,
        volume: { liters: Number, gallons: Number },
        weight: { kg: Number, lbs: Number, mt: Number },
      }],
      // Legacy: single product per container
      product: {
        name: String,
        description: String,
        hsCode: String,
      },
      quantity: {
        volume: { liters: Number, gallons: Number },
        weight: { kg: Number, lbs: Number, mt: Number },
      },
    }],
    parties: {
      shipper: { name: String, address: String, taxId: String },
      consignee: { name: String, address: String, taxId: String },
      notifyParty: { name: String, address: String },
    },
    commercial: {
      currency: String,
      freightTerms: String,
      itnNumber: String,
      totalWeight: { kg: String, lbs: String },
    },
    meta: mongoose.Schema.Types.Mixed,
  },
  status: {
    type: String,
    enum: VALID_STATUSES,
    default: 'active',
  },
  supersededBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: false,
  },
}, {
  timestamps: true
});

// Create indexes
documentSchema.index({ clientId: 1, type: 1 });
documentSchema.index({ 'bolData.bolNumber': 1 });
documentSchema.index({ relatedBolId: 1 });
documentSchema.index({ relatedBolId: 1, status: 1 });

// Create and export the model, safely handling HMR
export const Document = mongoose.models.Document
  ? (mongoose.models.Document as mongoose.Model<IDocument>)
  : mongoose.model<IDocument>('Document', documentSchema);
