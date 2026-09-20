import mongoose, { Schema, Document, Model } from 'mongoose';

export type LedgerAuditAction = 'LEDGER_ENTRY_CREATED' | 'LEDGER_ENTRY_DUPLICATE_ATTEMPT';
export type LedgerAuditStatus = 'completed' | 'failed' | 'duplicate';

export interface ILedgerAuditLog extends Document {
  tenantId: string;
  eventId: string;
  ledgerEntryId?: mongoose.Types.ObjectId;
  action: LedgerAuditAction;
  status: LedgerAuditStatus;
  details?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const LedgerAuditSchema: Schema = new Schema(
  {
    tenantId: {
      type: String,
      required: [true, 'tenantId is required'],
      trim: true,
    },
    eventId: {
      type: String,
      required: [true, 'eventId is required'],
      trim: true,
    },
    ledgerEntryId: {
      type: Schema.Types.ObjectId,
      ref: 'LedgerEntry',
      required: false,
    },
    action: {
      type: String,
      required: [true, 'action is required'],
      enum: ['LEDGER_ENTRY_CREATED', 'LEDGER_ENTRY_DUPLICATE_ATTEMPT'],
    },
    status: {
      type: String,
      required: [true, 'status is required'],
      enum: ['completed', 'failed', 'duplicate'],
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for performant audit queries by tenant and event
LedgerAuditSchema.index({ tenantId: 1, eventId: 1 });
LedgerAuditSchema.index({ tenantId: 1, createdAt: -1 });

export const getLedgerAuditModel = (conn: mongoose.Connection): Model<ILedgerAuditLog> => {
  if (conn.models.LedgerAuditLog) {
    return conn.models.LedgerAuditLog as Model<ILedgerAuditLog>;
  }
  return conn.model<ILedgerAuditLog>('LedgerAuditLog', LedgerAuditSchema);
};

