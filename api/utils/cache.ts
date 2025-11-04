import { LTPResponse } from '../../shared/types.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 30000; // 30 seconds default TTL

  set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const timeToLive = ttl || this.defaultTTL;
    
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + timeToLive
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Create singleton instance
export const cache = new MemoryCache();

// Cache keys
export const CacheKeys = {
  LTP: (symbol: string) => `ltp:${symbol}`,
  BARS: (symbol: string, interval: string, from: string, to: string) => 
    `bars:${symbol}:${interval}:${from}:${to}`,
  TICKS: (symbol: string, from: string, to: string) => 
    `ticks:${symbol}:${from}:${to}`
};

// Cache TTL values (in milliseconds)
export const CacheTTL = {
  LTP: 15000,      // 15 seconds for LTP data
  BARS: 300000,    // 5 minutes for bar data
  TICKS: 60000,    // 1 minute for tick data
  QUOTA_ERROR: 300000, // 5 minutes for quota error
  SHORT: 60000     // 60 seconds for short-term cache (increased from 30)
};

// Start cleanup interval
setInterval(() => {
  cache.cleanup();
}, 60000); // Clean up every minute