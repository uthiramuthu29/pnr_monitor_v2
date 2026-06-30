import mongoose, { Schema, Document } from 'mongoose';

export interface IMonitor extends Document {
  pnr: string;
  frequencyHours: number;
  active: boolean;
  whatsappNumbers: string[]; // List of phone numbers to notify (e.g. ["+91XXXXXXXXXX"])
  lastCheckedAt?: Date;
  lastStatus?: string; // Stringified JSON structure of the PNR status details
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationLog extends Document {
  monitorId: mongoose.Types.ObjectId;
  pnr: string;
  phoneNumber: string;
  message: string;
  status: 'MOCK_SENT' | 'DELIVERED' | 'FAILED';
  errorMessage?: string;
  sentAt: Date;
}

const MonitorSchema = new Schema<IMonitor>({
  pnr: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    validate: {
      validator: function(v: string) {
        return /^\d{10}$/.test(v); // 10-digit numeric PNR validation
      },
      message: (props: { value: string }) => `${props.value} is not a valid 10-digit PNR number!`
    }
  },
  frequencyHours: { type: Number, required: true, default: 2, min: 1, max: 168 },
  active: { type: Boolean, required: true, default: true },
  whatsappNumbers: { 
    type: [String], 
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v.length > 0 && v.every(num => /^\+?[1-9]\d{1,14}$/.test(num)); // basic international phone number check
      },
      message: 'Provide at least one valid WhatsApp phone number in international format (+[CountryCode][Number])'
    }
  },
  lastCheckedAt: { type: Date },
  lastStatus: { type: String },
}, { timestamps: true });

const NotificationLogSchema = new Schema<INotificationLog>({
  monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
  pnr: { type: String, required: true, index: true },
  phoneNumber: { type: String, required: true },
  message: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['MOCK_SENT', 'DELIVERED', 'FAILED'] 
  },
  errorMessage: { type: String },
  sentAt: { type: Date, default: Date.now, index: true }
});

// Ensure indexes are created
MonitorSchema.index({ active: 1, lastCheckedAt: 1 });

export const Monitor = mongoose.models.Monitor || mongoose.model<IMonitor>('Monitor', MonitorSchema);
export const NotificationLog = mongoose.models.NotificationLog || mongoose.model<INotificationLog>('NotificationLog', NotificationLogSchema);
