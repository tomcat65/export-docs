import mongoose from 'mongoose'

export interface ISystemStatus {
  type: 'backup' | 'cleanup' | 'system'
  status: 'idle' | 'in_progress' | 'completed' | 'failed'
  message?: string
  updatedAt: Date
}

// Avoid TS errors when creating a model in Next.js environment
// with potential Hot Module Replacement
const SystemStatusModel = () => {
  // Check if schema is already registered to avoid duplicate model error during HMR
  if (mongoose.models.SystemStatus) {
    return mongoose.models.SystemStatus as mongoose.Model<ISystemStatus>
  }

  const systemStatusSchema = new mongoose.Schema<ISystemStatus>({
    type: {
      type: String,
      required: true,
      enum: ['backup', 'cleanup', 'system'],
    },
    status: {
      type: String,
      required: true,
      enum: ['idle', 'in_progress', 'completed', 'failed'],
    },
    message: String,
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  })

  // Ensure the index exists for faster lookups
  systemStatusSchema.index({ type: 1 })
  
  return mongoose.model<ISystemStatus>('SystemStatus', systemStatusSchema)
}

// Export the model with a safeguard to prevent errors during module initialization
export const SystemStatus = (mongoose.connection?.readyState === 1)
  ? SystemStatusModel()
  : (mongoose.models.SystemStatus || mongoose.model<ISystemStatus>('SystemStatus', new mongoose.Schema<ISystemStatus>({
      type: { type: String, required: true, enum: ['backup', 'cleanup', 'system'] },
      status: { type: String, required: true, enum: ['idle', 'in_progress', 'completed', 'failed'] },
      message: String,
      updatedAt: { type: Date, default: Date.now }
    })))
