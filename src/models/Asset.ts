import mongoose from 'mongoose'

interface IAsset {
  name: string
  type: 'signature' | 'notary_seal' | 'letterhead' | 'other'
  description?: string
  fileId: mongoose.Types.ObjectId  // GridFS file ID
  contentType: string
  owner?: string
  createdAt: Date
  updatedAt: Date
}

const assetSchema = new mongoose.Schema<IAsset>({
  name: {
    type: String,
    required: [true, 'Asset name is required'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Asset type is required'],
    enum: ['signature', 'notary_seal', 'letterhead', 'other']
  },
  description: {
    type: String,
    required: false,
    trim: true
  },
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'File ID is required']
  },
  contentType: {
    type: String,
    required: [true, 'Content type is required']
  },
  owner: {
    type: String,
    required: false
  }
}, {
  timestamps: true
})

// Create indexes
assetSchema.index({ name: 1 })
assetSchema.index({ type: 1 })

// Prevent mongoose from creating a new model if it already exists
export const Asset = mongoose.models.Asset || mongoose.model<IAsset>('Asset', assetSchema) 