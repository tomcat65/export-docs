import mongoose from 'mongoose'

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  rif: {
    type: String,
    required: [true, 'RIF is required'],
    trim: true
  },
  address: {
    type: String,
    required: false,
    trim: true
  },
  contact: {
    type: Object,
    required: false
  },
  requiredDocuments: {
    type: Array,
    default: []
  },
  lastDocumentDate: {
    type: String,
    required: false
  },
  __v: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
})

// Create indexes
clientSchema.index({ name: 1 })

// Update the updatedAt timestamp before saving
clientSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

// Prevent mongoose from creating a new model if it already exists
export const Client = mongoose.models.Client || mongoose.model('Client', clientSchema) 