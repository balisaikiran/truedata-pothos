interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private maxRequests: number;
  private windowMs: number;
  private minInterval: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000, minInterval: number = 1000) {
    this.maxRequests = maxRequests; // Max requests per window
    this.windowMs = windowMs; // Time window in milliseconds
    this.minInterval = minInterval; // Minimum interval between requests
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry) {
      // First request for this key
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
        lastRequest: now
      });
      return { allowed: true };
    }

    // Check if window has reset
    if (now >= entry.resetTime) {
      entry.count = 1;
      entry.resetTime = now + this.windowMs;
      entry.lastRequest = now;
      return { allowed: true };
    }

    // Check minimum interval between requests
    const timeSinceLastRequest = now - entry.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      return {
        allowed: false,
        retryAfter: Math.ceil((this.minInterval - timeSinceLastRequest) / 1000)
      };
    }

    // Check if within rate limit
    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000)
      };
    }

    // Allow request and increment counter
    entry.count++;
    entry.lastRequest = now;
    return { allowed: true };
  }

  // Wait for rate limit to allow request
  async waitForLimit(key: string): Promise<void> {
    const result = await this.checkLimit(key);
    
    if (!result.allowed && result.retryAfter) {
      await new Promise(resolve => setTimeout(resolve, result.retryAfter * 1000));
      return this.waitForLimit(key); // Recursive check
    }
  }

  // Reset limits for a key
  reset(key: string): void {
    this.limits.delete(key);
  }

  // Clear all limits
  clear(): void {
    this.limits.clear();
  }

  // Get current status for a key
  getStatus(key: string) {
    const entry = this.limits.get(key);
    if (!entry) {
      return {
        count: 0,
        remaining: this.maxRequests,
        resetTime: null
      };
    }

    const now = Date.now();
    if (now >= entry.resetTime) {
      return {
        count: 0,
        remaining: this.maxRequests,
        resetTime: now + this.windowMs
      };
    }

    return {
      count: entry.count,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetTime: entry.resetTime
    };
  }
}

// Create rate limiter instances for different API endpoints
export const ltpRateLimiter = new RateLimiter(5, 60000, 3000); // 5 requests per minute, min 3 seconds between requests
export const barsRateLimiter = new RateLimiter(10, 60000, 1000); // 10 requests per minute, min 1 second between requests
export const ticksRateLimiter = new RateLimiter(3, 60000, 5000); // 3 requests per minute, min 5 seconds between requests

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  
  [ltpRateLimiter, barsRateLimiter, ticksRateLimiter].forEach(limiter => {
    // Access private limits through type assertion for cleanup
    const limits = (limiter as any).limits as Map<string, RateLimitEntry>;
    
    for (const [key, entry] of limits.entries()) {
      if (now >= entry.resetTime + 60000) { // Clean up entries older than 1 minute past reset
        limits.delete(key);
      }
    }
  });
}, 300000); // Clean up every 5 minutes