import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITenantTestRecord extends Document {
  tenantId: string;
  message: string;
  createdAt: Date;
}

const TenantTestRecordSchema: Schema = new Schema({
  tenantId: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const getTenantTestModel = (conn: mongoose.Connection): Model<ITenantTestRecord> => {
  if (conn.models.TenantTestRecord) {
    return conn.models.TenantTestRecord as Model<ITenantTestRecord>;
  }
  return conn.model<ITenantTestRecord>('TenantTestRecord', TenantTestRecordSchema);
};

