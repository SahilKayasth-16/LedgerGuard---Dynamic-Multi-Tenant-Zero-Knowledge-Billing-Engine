import mongoose from 'mongoose';
import { getLedgerModel, ILedgerEntry } from '../models/ledger.model';
import { CreateLedgerDTO } from './ledger.service';

export interface IdempotencyResult {
  duplicate: boolean;
  entry: ILedgerEntry;
}

export class IdempotencyService {
  /**
   * Executes idempotent processing for a ledger event within the tenant-isolated database.
   * Combines application-level lookup with database-level compound unique index protection.
   */
  public async processIdempotentLedgerEntry(
    tenantDb: mongoose.Connection,
    tenantId: string,
    data: CreateLedgerDTO
  ): Promise<IdempotencyResult> {
    const LedgerModel = getLedgerModel(tenantDb);
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

    // 2. Attempt creation
    try {
      const entry = new LedgerModel({
        eventId: trimmedEventId,
        tenantId: tenantId, // Strict JWT tenant identity authority
        type: data.type,
        amount: data.amount,
        currency: data.currency ? data.currency.toUpperCase() : 'INR',
        description: data.description ? data.description.trim() : undefined,
        status: 'pending',
        metadata: data.metadata || {},
      });

      const savedEntry = await entry.save();
      return {
        duplicate: false,
        entry: savedEntry,
      };
    } catch (error: any) {
      // 3. Database unique constraint catch for concurrent races (MongoDB E11000)
      if (error.code === 11000 || (error.message && error.message.includes('E11000'))) {
        // Re-query the existing record that was committed by the concurrent winner
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

      // Rethrow if unexpected error
      throw error;
    }
  }
}

export const idempotencyService = new IdempotencyService();

