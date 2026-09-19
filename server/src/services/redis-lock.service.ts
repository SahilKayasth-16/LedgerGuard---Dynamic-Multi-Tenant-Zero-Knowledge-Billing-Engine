import { randomUUID } from 'crypto';
import { getRedisClient, connectRedis, isRedisAvailable } from '../config/redis';
import { config } from '../config/env';

export interface LockAcquireResult {
  acquired: boolean;
  token?: string;
  redisUnavailable?: boolean;
}

export class RedisLockService {
  /**
   * Generates the Redis lock key enforcing multi-tenant isolation boundaries.
   * Key pattern: ledger:lock:{tenantId}:{eventId}
   */
  public getLockKey(tenantId: string, eventId: string): string {
    return `ledger:lock:${tenantId.trim()}:${eventId.trim()}`;
  }

  /**
   * Attempts to acquire an atomic distributed lock for a specific tenant + eventId.
   * Uses Redis SET with NX (not exists) and PX (millisecond TTL).
   */
  public async acquireLock(
    tenantId: string,
    eventId: string,
    customTtlMs?: number
  ): Promise<LockAcquireResult> {
    let client = getRedisClient();

    if (!client.isOpen) {
      await connectRedis();
      client = getRedisClient();
    }

    if (!isRedisAvailable()) {
      console.warn(`[LOCK WARNING] Redis is unavailable. Unable to acquire lock for tenant=${tenantId}, event=${eventId}`);
      return { acquired: false, redisUnavailable: true };
    }

    // If client is still not open after connection attempt
    if (!client.isOpen) {
      await connectRedis();
      client = getRedisClient();
    }

    if (!client.isOpen || !isRedisAvailable()) {
      console.warn(`[LOCK WARNING] Redis client is not open. Unable to acquire lock for tenant=${tenantId}, event=${eventId}`);
      return { acquired: false, redisUnavailable: true };
    }

    const lockKey = this.getLockKey(tenantId, eventId);
    const token = randomUUID();
    const ttlMs = customTtlMs && customTtlMs > 0 ? customTtlMs : config.redisLockTtlMs;

    try {
      // Atomic SET key token NX PX ttlMs
      const reply = await client.set(lockKey, token, {
        condition: 'NX',
        expiration: {
          type: 'PX',
          value: ttlMs,
        },
      });

      if (reply === 'OK') {
        console.log(`[LOCK ACQUIRED] Tenant: ${tenantId}, Event: ${eventId}`);
        return {
          acquired: true,
          token,
        };
      }

      console.log(`[LOCK CONTENTION] Lock unavailable for Tenant: ${tenantId}, Event: ${eventId}`);
      return {
        acquired: false,
      };
    } catch (error: any) {
      console.error(`[LOCK ERROR] Redis error during lock acquisition for tenant=${tenantId}, event=${eventId}:`, error.message || error);
      return {
        acquired: false,
        redisUnavailable: true,
      };
    }
  }

  /**
   * Releases an acquired distributed lock atomically using a Lua script comparison.
   * Prevents a request from accidentally deleting a lock owned by another request after TTL expiry.
   */
  public async releaseLock(
    tenantId: string,
    eventId: string,
    token: string
  ): Promise<boolean> {
    const client = getRedisClient();

    if (!client.isOpen) {
      console.warn(`[LOCK WARNING] Redis client not open during release attempt for tenant=${tenantId}, event=${eventId}`);
      return false;
    }

    const lockKey = this.getLockKey(tenantId, eventId);

    // Atomic compare-and-delete Lua script
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await client.eval(luaScript, {
        keys: [lockKey],
        arguments: [token],
      });

      // Redis Lua EVAL returns 1 if deleted, 0 if token mismatch or key already expired
      if (Number(result) === 1) {
        console.log(`[LOCK RELEASED] Tenant: ${tenantId}, Event: ${eventId}`);
        return true;
      } else {
        console.log(`[LOCK RELEASE MISMATCH] Token mismatch or lock already expired for Tenant: ${tenantId}, Event: ${eventId}`);
        return false;
      }
    } catch (error: any) {
      console.error(`[LOCK ERROR] Redis error during lock release for tenant=${tenantId}, event=${eventId}:`, error.message || error);
      return false;
    }
  }

  /**
   * Helper to check Redis connection status.
   */
  public isAvailable(): boolean {
    return isRedisAvailable();
  }
}

export const redisLockService = new RedisLockService();
