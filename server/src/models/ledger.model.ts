import mongoose, { Schema, Document, Model } from 'mongoose';

export type LedgerEntryType = 'debit' | 'credit';
export type LedgerEntryStatus = 'pending' | 'completed' | 'failed';

export interface ILedgerEntry extends Document {
  eventId: string;
  tenantId: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  description?: string;
  status: LedgerEntryStatus;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const LedgerSchema: Schema = new Schema(
  {
    eventId: {
      type: String,
      required: [true, 'eventId is required'],
      trim: true,
    },
    tenantId: {
      type: String,
      required: [true, 'tenantId is required'],
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'type is required'],
      enum: {
        values: ['debit', 'credit'],
        message: 'type must be either debit or credit',
      },
    },
    amount: {
      type: Number,
      required: [true, 'amount is required'],
      validate: {
        validator: function (v: number) {
          return typeof v === 'number' && Number.isFinite(v) && v > 0;
        },
        message: 'amount must be a positive finite number greater than zero',
      },
    },
    currency: {
      type: String,
      required: [true, 'currency is required'],
      uppercase: true,
      trim: true,
      minlength: [3, 'currency code must be 3 letters'],
      maxlength: [3, 'currency code must be 3 letters'],
      validate: {
        validator: function (v: string) {
          return /^[A-Z]{3}$/.test(v);
        },
        message: 'currency must be a valid 3-character uppercase ISO code',
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'description cannot exceed 500 characters'],
    },
    status: {
      type: String,
      required: [true, 'status is required'],
      enum: {
        values: ['pending', 'completed', 'failed'],
        message: 'status must be pending, completed, or failed',
      },
      default: 'pending',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index enforcing tenant-aware idempotency on eventId
LedgerSchema.index({ tenantId: 1, eventId: 1 }, { unique: true });

export const getLedgerModel = (conn: mongoose.Connection): Model<ILedgerEntry> => {
  if (conn.models.LedgerEntry) {
    return conn.models.LedgerEntry as Model<ILedgerEntry>;
  }
  return conn.model<ILedgerEntry>('LedgerEntry', LedgerSchema);
};

