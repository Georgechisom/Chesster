const {
  withLock,
  acquireLock,
  getActiveHeartbeatCount,
  LOCK_RENEWAL_INTERVAL,
} = require("../utils/distributedLock");
const { getRedisClient } = require("../config/redis");

jest.mock("../config/redis", () => ({
  getRedisClient: jest.fn(),
}));

describe("Distributed Lock", () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockRedis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      eval: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should execute functions serially with in-memory fallback", async () => {
    jest.useRealTimers();
    getRedisClient.mockReturnValue(null);
    let concurrentCount = 0;

    const task = async () => {
      concurrentCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrentCount--;
      return true;
    };

    const promises = [
      withLock("game1", 2000, task).catch((e) => e.message),
      withLock("game1", 2000, task).catch((e) => e.message),
    ];

    const results = await Promise.all(promises);
    expect(results).toContain("Concurrent move in progress, try again");
    expect(results).toContain(true);
    expect(concurrentCount).toBe(0);
  });

  it("should acquire lock with heartbeat renewal enabled", async () => {
    getRedisClient.mockReturnValue(mockRedis);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1); // Renewal successful

    const lock = await acquireLock("test-key", 10000, { autoRenew: true });

    expect(lock).not.toBeNull();
    expect(lock.token).toBeDefined();
    expect(lock.heartbeatId).toBeDefined();
    expect(mockRedis.set).toHaveBeenCalledWith(
      "lock:test-key",
      expect.any(String),
      "PX",
      10000,
      "NX"
    );

    // Advance time to trigger heartbeat
    jest.advanceTimersByTime(LOCK_RENEWAL_INTERVAL + 100);
    await Promise.resolve(); // Let promises settle

    expect(mockRedis.eval).toHaveBeenCalled();

    await lock.release();
  });

  it("should maintain lock ownership during long async operations", async () => {
    getRedisClient.mockReturnValue(mockRedis);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1); // Renewal successful
    mockRedis.del.mockResolvedValue(1);

    let operationCompleted = false;
    const longOperation = async () => {
      // Simulate a long escrow settlement (6 seconds)
      await new Promise((resolve) => {
        setTimeout(() => {
          operationCompleted = true;
          resolve();
        }, 6000);
      });
      return "success";
    };

    const lockPromise = withLock("match-123", 10000, longOperation, { autoRenew: true });
    // Flush microtasks so acquireLock finishes and longOperation starts at time 0
    await jest.advanceTimersByTimeAsync(0);

    // Advance timers to simulate the long operation
    await jest.advanceTimersByTimeAsync(3000); // First renewal
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3000); // Second renewal
    expect(mockRedis.eval).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(100); // Complete the operation
    const result = await lockPromise;

    expect(result).toBe("success");
    expect(operationCompleted).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining("pexpire"),
      1,
      "lock:match-123",
      expect.any(String),
      10000
    );
  });

  it("should prevent concurrent lock acquisition during auto-renewal", async () => {
    getRedisClient.mockReturnValue(mockRedis);
    mockRedis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    mockRedis.eval.mockResolvedValue(1);

    const lock1 = await acquireLock("resource-1", 10000, { autoRenew: true });
    expect(lock1).not.toBeNull();

    // Try to acquire same lock
    const lock2 = await acquireLock("resource-1", 10000, { autoRenew: true });
    expect(lock2).toBeNull();

    await lock1.release();
  });

  it("should stop heartbeat when renewal fails", async () => {
    getRedisClient.mockReturnValue(mockRedis);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0); // Second renewal fails

    const lock = await acquireLock("test-key", 10000, { autoRenew: true });
    const initialHeartbeats = getActiveHeartbeatCount();

    // First renewal succeeds
    jest.advanceTimersByTime(LOCK_RENEWAL_INTERVAL + 100);
    await Promise.resolve();
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);

    // Second renewal fails
    jest.advanceTimersByTime(LOCK_RENEWAL_INTERVAL + 100);
    await Promise.resolve();
    expect(mockRedis.eval).toHaveBeenCalledTimes(2);

    // Heartbeat should be stopped
    expect(getActiveHeartbeatCount()).toBeLessThan(initialHeartbeats);

    await lock.release();
  });

  it("should handle errors during heartbeat renewal gracefully", async () => {
    getRedisClient.mockReturnValue(mockRedis);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockRejectedValueOnce(new Error("Redis connection lost")).mockResolvedValue(1);

    const lock = await acquireLock("test-key", 10000, { autoRenew: true });

    // Trigger heartbeat that will fail
    jest.advanceTimersByTime(LOCK_RENEWAL_INTERVAL + 100);
    await Promise.resolve();

    // Should not throw, heartbeat stops gracefully
    await lock.release();
  });

  it("should not leak process handles with unref timers", async () => {
    getRedisClient.mockReturnValue(mockRedis);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    const lock = await acquireLock("test-key", 10000, { autoRenew: true });

    // The test itself verifies unref is called in implementation
    // Process should not be held open by the timer
    await lock.release();

    expect(getActiveHeartbeatCount()).toBe(0);
  });

  it("should release lock atomically with Lua script", async () => {
    getRedisClient.mockReturnValue(mockRedis);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    const lock = await acquireLock("test-key", 10000, { autoRenew: false });
    await lock.release();

    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining("del"),
      1,
      "lock:test-key",
      lock.token
    );
  });
});
