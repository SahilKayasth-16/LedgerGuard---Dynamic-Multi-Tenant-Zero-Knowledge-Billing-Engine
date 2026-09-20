import mongoose from 'mongoose';
import { getLedgerModel, ILedgerEntry } from '../models/ledger.model';
import { getLedgerAuditModel, ILedgerAuditLog } from '../models/ledgerAudit.model';
import { CreateLedgerDTO } from './ledger.service';
import { transactionService } from './transaction.service';

export interface IdempotencyResult {
  duplicate: boolean;
  entry: ILedgerEntry;
  auditLog?: ILedgerAuditLog;
}

export class IdempotencyService {
  /**
   * Executes idempotent processing for a ledger event within the tenant-isolated database.
   * Uses MongoDB ACID multi-document transactions to guarantee atomic creation of both
   * the LedgerEntry and its corresponding LedgerAuditLog document.
   */
  public async processIdempotentLedgerEntry(
    tenantDb: mongoose.Connection,
    tenantId: string,
    data: CreateLedgerDTO
  ): Promise<IdempotencyResult> {
    const LedgerModel = getLedgerModel(tenantDb);
    const AuditModel = getLedgerAuditModel(tenantDb);
    const trimmedEventId = data.eventId.trim();

    // 1. Application-level check: Does an entry already exist for this (tenantId, eventId)?
    const existingEntry = await LedgerModel.findOne({
      tenantId,
      eventId: trimmedEventId,
    });

    if (existingEntry) {
      return {
        duplicate: true,
        entry: existingEntry,
      };
    }

    // 2. Attempt multi-document atomic creation inside a MongoDB ACID transaction session
    try {
      return await transactionService.executeTransaction(tenantDb, async (session) => {
        const sessionOpts = session ? { session } : {};

        // Document 1: Create Ledger Entry
        const entry = new LedgerModel({
          eventId: trimmedEventId,
          tenantId: tenantId, // Strict JWT tenant identity authority
          type: data.type,
          amount: data.amount,
          currency: data.currency ? data.currency.toUpperCase() : 'INR',
          description: data.description ? data.description.trim() : undefined,
          status: 'completed',
          metadata: data.metadata || {},
        });

        const savedEntry = await entry.save(sessionOpts);

        // Document 2: Create Ledger Audit Log atomically in same transaction session
        const auditLog = new AuditModel({
          tenantId,
          eventId: trimmedEventId,
          ledgerEntryId: savedEntry._id,
          action: 'LEDGER_ENTRY_CREATED',
          status: 'completed',
          details: {
            type: data.type,
            amount: data.amount,
            currency: data.currency,
            description: data.description,
          },
        });

        const savedAuditLog = await auditLog.save(sessionOpts);

        return {
          duplicate: false,
          entry: savedEntry,
          auditLog: savedAuditLog,
        };
      });
    } catch (error: any) {
      // 3. Database unique constraint catch for concurrent races (MongoDB E11000)
      if (error.code === 11000 || (error.message && error.message.includes('E11000'))) {
        const racedEntry = await LedgerModel.findOne({
          tenantId,
          eventId: trimmedEventId,
        });

        if (racedEntry) {
          return {
            duplicate: true,
            entry: racedEntry,
          };
        }
      }

      // Rethrow if unexpected error (transaction will have aborted automatically)
      throw error;
    }
  }
}

export const idempotencyService = new IdempotencyService();
