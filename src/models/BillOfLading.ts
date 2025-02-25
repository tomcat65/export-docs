import mongoose from 'mongoose'

const BillOfLadingSchema = new mongoose.Schema({
  bolNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  bookingNumber: {
    type: String,
    trim: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  vessel: String,
  voyage: String,
  portOfLoading: {
    type: String,
    default: 'Houston, TX'
  },
  portOfDischarge: {
    type: String,
    required: true
  },
  containers: [{
    number: String,
    sealNumber: String,
    type: String,
    product: {
      name: String,
      density: Number
    },
    quantity: {
      liters: Number,
      gallons: Number,
      kilograms: Number
    }
  }],
  documents: [{
    type: {
      type: String,
      enum: ['COO', 'COA', 'Invoice', 'PackingList', 'SED']
    },
    fileUrl: String,
    createdAt: Date
  }],
  originalFile: {
    url: String,
    type: {
      type: String,
      enum: ['pdf', 'jpg', 'png']
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

export const BillOfLading = mongoose.models.BillOfLading || mongoose.model('BillOfLading', BillOfLadingSchema) 