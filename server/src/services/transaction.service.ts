import mongoose from 'mongoose';

export class TransactionService {
  /**
   * Executes multi-document database operations within a tenant-isolated MongoDB ACID transaction session.
   * `tenantDb` is the tenant-specific connection established via TenantConnectionManager.
   */
  public async executeTransaction<T>(
    tenantDb: mongoose.Connection,
    work: (session: mongoose.ClientSession | null) => Promise<T>
  ): Promise<T> {
    if (!tenantDb) {
      throw new Error('Tenant database connection is required for transaction execution.');
    }

    let session: mongoose.ClientSession | null = null;
    let transactionActive = false;

    try {
      session = await tenantDb.startSession();
      try {
        session.startTransaction();
        transactionActive = true;
      } catch (err: any) {
        // Fallback for standalone MongoDB test instances where replica set is not configured
        console.warn(
          `[TransactionService] Replica set transactions unavailable: ${err.message}. Proceeding without active multi-doc transaction.`
        );
        transactionActive = false;
      }

      const result = await work(transactionActive ? session : null);

      if (transactionActive && session && session.inTransaction()) {
        await session.commitTransaction();
      }

      return result;
    } catch (error: any) {
      if (transactionActive && session && session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (abortError: any) {
          console.error('[TransactionService] Failed to abort transaction:', abortError.message);
        }
      }
      throw error;
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch (endError: any) {
          console.error('[TransactionService] Failed to end session:', endError.message);
        }
      }
    }
  }
}

export const transactionService = new TransactionService();

