import mongoose from 'mongoose';
import { config } from '../config/env';
import { getTenantConfig } from '../config/tenantConfig';

class TenantConnectionManager {
  private connectionCache: Map<string, mongoose.Connection> = new Map();
  private pendingInitCache: Map<string, Promise<mongoose.Connection>> = new Map();

  /**
   * Retrieves or establishes a cached, tenant-isolated Mongoose connection.
   */
  public async getTenantConnection(tenantId: string): Promise<mongoose.Connection> {
    if (!tenantId) {
      throw new Error('Tenant ID is required to resolve database connection.');
    }

    // 1. Resolve tenant configuration
    const tenantConfig = getTenantConfig(tenantId);

    // 2. Check if a healthy connection exists in cache
    const existingConn = this.connectionCache.get(tenantId);
    if (existingConn) {
      // 1 = connected
      if (existingConn.readyState === 1) {
        return existingConn;
      }
      // If disconnected or broken, remove stale connection from cache
      if (existingConn.readyState === 0) {
        this.connectionCache.delete(tenantId);
      }
    }

    // 3. Handle in-flight concurrent connection initialization
    if (this.pendingInitCache.has(tenantId)) {
      return await this.pendingInitCache.get(tenantId)!;
    }

    // 4. Create new connection promise for concurrent request deduplication
    const initPromise = (async (): Promise<mongoose.Connection> => {
      try {
        const baseUri = config.mongodbUri; // Fails fast if missing

        const conn = mongoose.createConnection(baseUri, {
          dbName: tenantConfig.databaseName,
          autoIndex: true,
          serverSelectionTimeoutMS: 5000,
        });

        // Wait until connection is ready
        await conn.asPromise();

        this.connectionCache.set(tenantId, conn);
        console.log(`[MongoDB] Connection established & cached for tenant: ${tenantId}`);
        return conn;
      } catch (error: any) {
        console.error(`[MongoDB] Connection failure for tenant '${tenantId}':`, error.message);
        throw new Error(`Failed to establish database connection for tenant: ${tenantId}`);
      } finally {
        this.pendingInitCache.delete(tenantId);
      }
    })();

    this.pendingInitCache.set(tenantId, initPromise);
    return await initPromise;
  }

  /**
   * Disconnects a specific tenant and removes it from cache.
   */
  public async disconnectTenant(tenantId: string): Promise<void> {
    const conn = this.connectionCache.get(tenantId);
    if (conn) {
      try {
        await conn.close();
        console.log(`[MongoDB] Disconnected tenant connection: ${tenantId}`);
      } catch (err: any) {
        console.error(`[MongoDB] Error closing connection for tenant ${tenantId}:`, err.message);
      } finally {
        this.connectionCache.delete(tenantId);
      }
    }
    this.pendingInitCache.delete(tenantId);
  }

  /**
   * Disconnects all cached tenant connections cleanly.
   */
  public async disconnectAll(): Promise<void> {
    const tenantIds = Array.from(this.connectionCache.keys());
    for (const tenantId of tenantIds) {
      await this.disconnectTenant(tenantId);
    }
    this.connectionCache.clear();
    this.pendingInitCache.clear();
    console.log('[MongoDB] All tenant connections closed.');
  }

  /**
   * Diagnostic summary (safe for logging/metrics without credentials).
   */
  public getCacheStats(): { activeConnections: number; cachedTenants: string[]; pendingInitializations: number } {
    return {
      activeConnections: this.connectionCache.size,
      cachedTenants: Array.from(this.connectionCache.keys()),
      pendingInitializations: this.pendingInitCache.size,
    };
  }
}

export const tenantConnectionManager = new TenantConnectionManager();

