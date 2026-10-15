/**
 * Issue 403: Distributed Lock Heartbeat Renewal
 * 
 * Add auto-renewal heartbeat to prevent lock expiration during long async operations.
 */

// ADD: Heartbeat renewal configuration
const LOCK_RENEWAL_INTERVAL = 3000; // Renew every 3 seconds
const LOCK_TTL = 10000; // 10 second TTL

// ADD: Lua script for atomic lock renewal
const renewLockScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
else
    return 0
end
`;

class DistributedLock {
    constructor(redis) {
        this.redis = redis;
        this.activeLocks = new Map(); // Track heartbeat timers
    }

    /**
     * Acquire lock with optional heartbeat renewal
     */
    async acquireLock(key, token, ttl = LOCK_TTL, options = {}) {
        const { autoRenew = false } = options;

        // Try to acquire lock
        const acquired = await this.redis.set(key, token, 'PX', ttl, 'NX');
        
        if (!acquired) {
            return false; // Lock already held
        }

        // Start heartbeat renewal if requested
        if (autoRenew) {
            this.startHeartbeat(key, token, ttl);
        }

        return true;
    }

    /**
     * Start heartbeat renewal timer
     */
    startHeartbeat(key, token, ttl) {
        const intervalId = setInterval(async () => {
            try {
                const renewed = await this.redis.eval(
                    renewLockScript,
                    1,
                    key,
                    token,
                    ttl
                );
                
                if (!renewed) {
                    console.warn(`Lock renewal failed for ${key}, token no longer valid`);
                    this.stopHeartbeat(key);
                }
            } catch (error) {
                console.error(`Heartbeat renewal error for ${key}:`, error);
                this.stopHeartbeat(key);
            }
        }, LOCK_RENEWAL_INTERVAL);

        // Unref to prevent blocking process exit
        intervalId.unref();

        // Store timer reference
        this.activeLocks.set(key, { token, intervalId });
    }

    /**
     * Stop heartbeat renewal
     */
    stopHeartbeat(key) {
        const lockInfo = this.activeLocks.get(key);
        if (lockInfo) {
            clearInterval(lockInfo.intervalId);
            this.activeLocks.delete(key);
        }
    }

    /**
     * Release lock and stop heartbeat
     */
    async releaseLock(key, token) {
        // Stop heartbeat first
        this.stopHeartbeat(key);

        // Atomic release via Lua script
        const releaseScript = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        else
            return 0
        end
        `;

        await this.redis.eval(releaseScript, 1, key, token);
    }

    /**
     * Execute function with heartbeat-guarded lock
     */
    async withLock(key, token, fn, ttl = LOCK_TTL) {
        const acquired = await this.acquireLock(key, token, ttl, { autoRenew: true });
        
        if (!acquired) {
            throw new Error(`Failed to acquire lock: ${key}`);
        }

        try {
            return await fn();
        } finally {
            await this.releaseLock(key, token);
        }
    }
}

module.exports = { DistributedLock, LOCK_TTL, LOCK_RENEWAL_INTERVAL };

// USAGE in moveAuthority.js:
// const lock = new DistributedLock(redis);
// await lock.withLock(`match:${matchId}`, lockToken, async () => {
//     await escrowService.settleMatch(matchId);
// });
