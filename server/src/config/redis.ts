import { createClient, RedisClientType } from 'redis';
import { config } from './env';

let redisClient: RedisClientType | null = null;
let memoryServerInstance: any = null;
let isConnecting = false;
let simulatedFailure = false;

/**
 * Returns the singleton Redis client instance.
 */
export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    const targetUrl = process.env.REDIS_URL || config.redisUrl;

    redisClient = createClient({
      url: targetUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (process.env.NODE_ENV === 'test') {
            return false;
          }
          if (retries > 3) {
            return false;
          }
          return Math.min(retries * 100, 1000);
        },
      },
    }) as RedisClientType;

    redisClient.on('connect', () => {
      console.log('[REDIS] Connecting to Redis server...');
    });

    redisClient.on('ready', () => {
      console.log('[REDIS] Redis client connected and ready.');
    });

    redisClient.on('error', (err) => {
      if (err.message && err.message.includes('ECONNREFUSED') && process.env.NODE_ENV === 'test') {
        return;
      }
      console.error('[REDIS ERROR] Redis client error:', err.message || err);
    });

    redisClient.on('reconnecting', () => {
      console.log('[REDIS] Redis client reconnecting...');
    });

    redisClient.on('end', () => {
      console.log('[REDIS] Redis connection closed.');
    });
  }

  return redisClient;
};

/**
 * Initializes connection to Redis server safely.
 * In test/development mode, automatically falls back to RedisMemoryServer if no external Redis is running.
 */
export const connectRedis = async (): Promise<RedisClientType | null> => {
  const client = getRedisClient();

  if (client.isOpen) {
    return client;
  }

  if (isConnecting) {
    return client;
  }

  isConnecting = true;
  try {
    await client.connect();
    return client;
  } catch (err: any) {
    // Clean up failed client instance
    try {
      await client.disconnect();
    } catch (_) {}
    redisClient = null;

    // If connection fails in test or dev mode, auto-start RedisMemoryServer fallback
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      try {
        if (!memoryServerInstance) {
          const { RedisMemoryServer } = await import('redis-memory-server');
          memoryServerInstance = new RedisMemoryServer();
          await memoryServerInstance.start();
          const host = await memoryServerInstance.getHost();
          const port = await memoryServerInstance.getPort();
          const fallbackUrl = `redis://${host}:${port}`;
          process.env.REDIS_URL = fallbackUrl;
          console.log(`[REDIS FALLBACK] Auto-started in-memory Redis server at ${fallbackUrl}`);
        }

        // Re-create client with fallback URL
        redisClient = createClient({
          url: process.env.REDIS_URL,
          socket: {
            reconnectStrategy: false,
          },
        }) as RedisClientType;
        redisClient.on('error', (e) => {
          if (process.env.NODE_ENV !== 'test') {
            console.error('[REDIS ERROR]', e.message || e);
          }
        });
        await redisClient.connect();
        return redisClient;
      } catch (fallbackErr: any) {
        console.error('[REDIS ERROR] Fallback in-memory Redis failed:', fallbackErr.message || fallbackErr);
      }
    }

    console.error('[REDIS ERROR] Failed to connect to Redis server:', err.message || err);
    return null;
  } finally {
    isConnecting = false;
  }
};

/**
 * Simulates a Redis service failure for testing resiliency.
 */
export const setSimulatedRedisFailure = (failed: boolean): void => {
  simulatedFailure = failed;
};

/**
 * Checks whether the Redis client is connected and ready to process commands.
 */
export const isRedisAvailable = (): boolean => {
  if (simulatedFailure) {
    return false;
  }
  return redisClient !== null && redisClient.isOpen;
};

/**
 * Gracefully disconnects the Redis client and stops any memory server.
 */
export const disconnectRedis = async (): Promise<void> => {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.disconnect();
      console.log('[REDIS] Redis client disconnected cleanly.');
    } catch (err: any) {
      console.error('[REDIS ERROR] Error during Redis disconnect:', err.message || err);
    }
  }

  if (memoryServerInstance) {
    try {
      await memoryServerInstance.stop();
      memoryServerInstance = null;
      console.log('[REDIS FALLBACK] In-memory Redis server stopped.');
    } catch (err: any) {
      console.error('[REDIS ERROR] Error stopping in-memory server:', err.message || err);
    }
  }

  redisClient = null;
};
