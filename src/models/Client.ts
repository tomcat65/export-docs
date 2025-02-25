import mongoose from 'mongoose'

const ClientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  rif: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  address: {
    type: String,
    required: true
  },
  contact: {
    name: String,
    email: String,
    phone: String
  },
  requiredDocuments: [{
    type: String,
    enum: ['COO', 'COA', 'Invoice', 'PackingList', 'SED']
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

export const Client = mongoose.models.Client || mongoose.model('Client', ClientSchema) 