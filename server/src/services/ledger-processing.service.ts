import mongoose from 'mongoose';
import { redisLockService } from './redis-lock.service';
import { idempotencyService, IdempotencyResult } from './idempotency.service';
import { CreateLedgerDTO } from './ledger.service';
import { ILedgerEntry } from '../models/ledger.model';

export type LedgerProcessStatus =
  | 'SUCCESS'
  | 'DUPLICATE'
  | 'EVENT_PROCESSING'
  | 'REDIS_UNAVAILABLE'
  | 'FAILED';

export interface LedgerProcessResult {
  status: LedgerProcessStatus;
  duplicate: boolean;
  entry?: ILedgerEntry;
  message: string;
  error?: string;
}

export class LedgerProcessingService {
  /**
   * Complete unified ledger processing orchestrator combining:
   * 1. JWT Tenant Identity & Connection Verification
   * 2. Redis Distributed Locking (ledger:lock:{tenantId}:{eventId})
   * 3. Application Idempotency Lookup (findOne({ tenantId, eventId }))
   * 4. MongoDB Multi-Document ACID Transactions (tenantDb.startSession())
   * 5. Atomic Lock Release in finally block
   */
  public async processLedgerEvent(
    tenantDb: mongoose.Connection,
    authenticatedTenantId: string,
    data: CreateLedgerDTO
  ): Promise<LedgerProcessResult> {
    const trimmedEventId = data.eventId.trim();

    // Step 1: Attempt to acquire Redis distributed lock
    const lockResult = await redisLockService.acquireLock(authenticatedTenantId, trimmedEventId);

    // If Redis is unavailable, fail fast with REDIS_UNAVAILABLE (503)
    if (lockResult.redisUnavailable) {
      console.warn(
        `[PROCESSING WARNING] Redis unavailable for tenant=${authenticatedTenantId}, eventId=${trimmedEventId}`
      );
      return {
        status: 'REDIS_UNAVAILABLE',
        duplicate: false,
        message: 'Ledger processing is temporarily unavailable.',
      };
    }

    // If lock is held by another request (concurrency contention), return EVENT_PROCESSING (409)
    if (!lockResult.acquired) {
      console.log(
        `[PROCESSING CONTENTION] Event currently processing for tenant=${authenticatedTenantId}, eventId=${trimmedEventId}`
      );
      return {
        status: 'EVENT_PROCESSING',
        duplicate: false,
        message: 'This billing event is currently being processed.',
      };
    }

    try {
      console.log(
        `[PROCESSING STARTED] Processing ledger event for tenant=${authenticatedTenantId}, eventId=${trimmedEventId}`
      );

      // Step 2 & 3: Idempotency check + MongoDB ACID Transaction execution
      const result: IdempotencyResult = await idempotencyService.processIdempotentLedgerEntry(
        tenantDb,
        authenticatedTenantId,
        {
          ...data,
          eventId: trimmedEventId,
        }
      );

      if (result.duplicate) {
        console.log(
          `[PROCESSING DUPLICATE] Event already exists for tenant=${authenticatedTenantId}, eventId=${trimmedEventId}`
        );
        return {
          status: 'DUPLICATE',
          duplicate: true,
          entry: result.entry,
          message: 'Ledger event has already been processed.',
        };
      }

      console.log(
        `[PROCESSING SUCCESS] Transaction committed for tenant=${authenticatedTenantId}, eventId=${trimmedEventId}`
      );
      return {
        status: 'SUCCESS',
        duplicate: false,
        entry: result.entry,
        message: 'Ledger entry created successfully.',
      };
    } catch (error: any) {
      console.error(
        `[PROCESSING FAILED] Error processing event for tenant=${authenticatedTenantId}, eventId=${trimmedEventId}:`,
        error.message || error
      );
      return {
        status: 'FAILED',
        duplicate: false,
        message: error.message || 'Failed to process ledger entry.',
        error: error.message,
      };
    } finally {
      // Step 4: Lock release MUST execute in finally block
      if (lockResult.token) {
        await redisLockService.releaseLock(authenticatedTenantId, trimmedEventId, lockResult.token);
      }
    }
  }
}

export const ledgerProcessingService = new LedgerProcessingService();

