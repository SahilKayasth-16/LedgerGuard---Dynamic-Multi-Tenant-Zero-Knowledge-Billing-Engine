import mongoose from 'mongoose';
import { getLedgerModel, ILedgerEntry, LedgerEntryType } from '../models/ledger.model';
import { getLedgerAuditModel, ILedgerAuditLog } from '../models/ledgerAudit.model';
import { idempotencyService, IdempotencyResult } from './idempotency.service';

export interface CreateLedgerDTO {
  eventId: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
}

export class LedgerService {
  /**
   * Creates or resolves a ledger entry idempotently in the tenant's isolated database.
   * `tenantId` is strictly injected from the server's authenticated context.
   */
  public async createLedgerEntry(
    tenantDb: mongoose.Connection,
    tenantId: string,
    data: CreateLedgerDTO
  ): Promise<IdempotencyResult> {
    return await idempotencyService.processIdempotentLedgerEntry(tenantDb, tenantId, data);
  }

  /**
   * Retrieves all ledger entries belonging strictly to the authenticated tenant.
   */
  public async getLedgerEntries(
    tenantDb: mongoose.Connection,
    tenantId: string
  ): Promise<ILedgerEntry[]> {
    const LedgerModel = getLedgerModel(tenantDb);
    return await LedgerModel.find({ tenantId }).sort({ createdAt: -1 }).select('-__v');
  }

  /**
   * Retrieves a single ledger entry by ID, enforcing tenant ownership boundaries.
   */
  public async getLedgerEntryById(
    tenantDb: mongoose.Connection,
    tenantId: string,
    id: string
  ): Promise<ILedgerEntry | null> {
    const LedgerModel = getLedgerModel(tenantDb);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }

    return await LedgerModel.findOne({ _id: id, tenantId }).select('-__v');
  }

  /**
   * Retrieves all ledger audit logs belonging strictly to the authenticated tenant.
   */
  public async getLedgerAuditLogs(
    tenantDb: mongoose.Connection,
    tenantId: string
  ): Promise<ILedgerAuditLog[]> {
    const AuditModel = getLedgerAuditModel(tenantDb);
    return await AuditModel.find({ tenantId }).sort({ createdAt: -1 }).select('-__v');
  }
}

export const ledgerService = new LedgerService();
