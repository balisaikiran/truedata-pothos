import express from 'express';
import axios from 'axios';
import { authenticateToken } from './auth';
import type { LTPResponse, BarData } from '../../shared/types';
import { handleTrueDataError, sendErrorResponse } from '../utils/errorHandler';
import { cache, CacheKeys, CacheTTL } from '../utils/cache';
import { ltpRateLimiter, barsRateLimiter, ticksRateLimiter } from '../utils/rateLimiter';

const router = express.Router();

// Get Last Traded Price (LTP) for a symbol
router.get('/ltp/:symbol', authenticateToken, async (req, res) => {
  try {
    const { symbol } = req.params;
    const trueDataToken = (req as any).user.trueDataToken;
    const cacheKey = CacheKeys.LTP(symbol);
    
    // Check cache first
    const cachedData = cache.get<LTPResponse>(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, fromCache: true });
    }

    // Check rate limit
    const rateLimitResult = await ltpRateLimiter.checkLimit(`ltp:${symbol}`);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
        isRateLimited: true
      });
    }
    
    const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
      params: {
        symbols: symbol,
        response: 'json'
      },
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    if (response.data && response.data.status === 'Success' && response.data.Records && response.data.Records.length > 0) {
      const record = response.data.Records[0];
      // TrueData getLTPBulk returns: [symbolId, timestamp, price, volume, change]
      const ltpResponse: LTPResponse = {
        symbol: symbol,
        ltp: parseFloat(record[2] || 0), // price is at index 2
        change: parseFloat(record[4] || 0), // change is at index 4
        changePercent: 0, // Not provided in this format
        volume: parseInt(record[3] || 0), // volume is at index 3
        timestamp: record[1] || new Date().toISOString(), // timestamp is at index 1
        bidPrice: 0, // Not provided in this format
        askPrice: 0, // Not provided in this format
        high: 0, // Not provided in this format
        low: 0 // Not provided in this format
      };

      // Cache the response
      cache.set(cacheKey, ltpResponse, CacheTTL.LTP);
      
      res.json(ltpResponse);
    } else {
      res.status(404).json({
        success: false,
        message: 'No data found for the symbol'
      });
    }
  } catch (error: any) {
    console.error('LTP fetch error:', error.response?.data || error.message);
    const trueDataError = handleTrueDataError(error);
    sendErrorResponse(res, trueDataError);
  }
});

// Get historical bar data
router.get('/bars/:symbol', authenticateToken, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { from, to, interval = '1m' } = req.query;
    const { trueDataToken } = req.user;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'from and to parameters are required'
      });
    }

    // Check cache first
    const cacheKey = CacheKeys.BARS(symbol, interval as string, from as string, to as string);
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, fromCache: true });
    }

    // Check rate limit
    const rateLimitResult = await barsRateLimiter.checkLimit(`bars:${symbol}`);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
        isRateLimited: true
      });
    }

    // Convert ISO dates to TrueData format (YYMMDDTHH:MM:SS)
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const yy = date.getFullYear().toString().slice(-2);
      const mm = (date.getMonth() + 1).toString().padStart(2, '0');
      const dd = date.getDate().toString().padStart(2, '0');
      const hh = date.getHours().toString().padStart(2, '0');
      const min = date.getMinutes().toString().padStart(2, '0');
      const ss = date.getSeconds().toString().padStart(2, '0');
      return `${yy}${mm}${dd}T${hh}:${min}:${ss}`;
    };

    const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getbars`, {
      params: {
        symbol,
        from: from ? formatDate(from as string) : undefined,
        to: to ? formatDate(to as string) : undefined,
        interval,
        response: 'json'
      },
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const bars: BarData[] = response.data.map((item: any) => ({
        symbol: item.symbol || symbol,
        timestamp: item.timestamp || item.date,
        open: parseFloat(item.open || 0),
        high: parseFloat(item.high || 0),
        low: parseFloat(item.low || 0),
        close: parseFloat(item.close || 0),
        volume: parseInt(item.volume || 0),
        interval
      }));

      const result = {
        bars,
        symbol,
        interval,
        total: bars.length
      };

      // Cache the response
      cache.set(cacheKey, result, CacheTTL.BARS);
      
      res.json(result);
    } else {
      const result = {
        bars: [],
        symbol,
        interval,
        total: 0
      };
      
      // Cache empty result for shorter time
      cache.set(cacheKey, result, CacheTTL.BARS / 2);
      
      res.json(result);
    }
  } catch (error: any) {
    console.error('Bar data fetch error:', error.response?.data || error.message);
    const trueDataError = handleTrueDataError(error);
    sendErrorResponse(res, trueDataError);
  }
});

// Get tick data
router.get('/ticks/:symbol', authenticateToken, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { from, to } = req.query;
    const { trueDataToken } = req.user;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'from and to parameters are required'
      });
    }

    // Check cache first
    const cacheKey = CacheKeys.TICKS(symbol, from as string, to as string);
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, fromCache: true });
    }

    // Check rate limit
    const rateLimitResult = await ticksRateLimiter.checkLimit(`ticks:${symbol}`);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
        isRateLimited: true
      });
    }

    // Convert ISO dates to TrueData format (YYMMDDTHH:MM:SS)
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const yy = date.getFullYear().toString().slice(-2);
      const mm = (date.getMonth() + 1).toString().padStart(2, '0');
      const dd = date.getDate().toString().padStart(2, '0');
      const hh = date.getHours().toString().padStart(2, '0');
      const min = date.getMinutes().toString().padStart(2, '0');
      const ss = date.getSeconds().toString().padStart(2, '0');
      return `${yy}${mm}${dd}T${hh}:${min}:${ss}`;
    };

    const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getticks`, {
      params: {
        symbol,
        from: from ? formatDate(from as string) : undefined,
        to: to ? formatDate(to as string) : undefined,
        bidask: 1,
        response: 'json'
      },
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const ticks = response.data.map((item: any) => ({
        symbol: item.symbol || symbol,
        price: parseFloat(item.price || item.close || 0),
        volume: parseInt(item.volume || 0),
        timestamp: item.timestamp || item.date,
        bidPrice: parseFloat(item.bid || 0),
        askPrice: parseFloat(item.ask || 0)
      }));

      const result = {
        ticks,
        symbol,
        total: ticks.length
      };

      // Cache the response
      cache.set(cacheKey, result, CacheTTL.TICKS);
      
      res.json(result);
    } else {
      const result = {
        ticks: [],
        symbol,
        total: 0
      };
      
      // Cache empty result for shorter time
      cache.set(cacheKey, result, CacheTTL.TICKS / 2);
      
      res.json(result);
    }
  } catch (error: any) {
    console.error('Tick data fetch error:', error.response?.data || error.message);
    const trueDataError = handleTrueDataError(error);
    sendErrorResponse(res, trueDataError);
  }
});

// Get last N bars for a symbol
router.get('/lastbars/:symbol', authenticateToken, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { count = 100, interval = '1m' } = req.query;
    const trueDataToken = (req as any).user.trueDataToken;

    // Calculate date range based on count
    const now = new Date();
    const hoursBack = Math.max(parseInt(count as string) * 0.1, 24); // Estimate hours needed
    const from = new Date(now.getTime() - (hoursBack * 60 * 60 * 1000));

    // Check cache first
    const cacheKey = CacheKeys.BARS(symbol, interval as string, from.toISOString(), now.toISOString());
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, fromCache: true });
    }

    // Check rate limit
    const rateLimitResult = await barsRateLimiter.checkLimit(`lastbars:${symbol}`);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
        isRateLimited: true
      });
    }
    
    // Convert ISO dates to TrueData format (YYMMDDTHH:MM:SS)
    const formatDate = (date: Date) => {
      const yy = date.getFullYear().toString().slice(-2);
      const mm = (date.getMonth() + 1).toString().padStart(2, '0');
      const dd = date.getDate().toString().padStart(2, '0');
      const hh = date.getHours().toString().padStart(2, '0');
      const min = date.getMinutes().toString().padStart(2, '0');
      const ss = date.getSeconds().toString().padStart(2, '0');
      return `${yy}${mm}${dd}T${hh}:${min}:${ss}`;
    };
    
    const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getbars`, {
      params: {
        symbol,
        from: formatDate(from),
        to: formatDate(now),
        interval,
        response: 'json'
      },
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const bars: BarData[] = response.data.slice(-parseInt(count as string)).map((item: any) => ({
        symbol: item.symbol || symbol,
        timestamp: item.timestamp || item.date,
        open: parseFloat(item.open || 0),
        high: parseFloat(item.high || 0),
        low: parseFloat(item.low || 0),
        close: parseFloat(item.close || 0),
        volume: parseInt(item.volume || 0),
        interval
      }));

      const result = {
        bars,
        symbol,
        interval,
        total: bars.length
      };

      // Cache the response
      cache.set(cacheKey, result, CacheTTL.BARS);
      
      res.json(result);
    } else {
      const result = {
        bars: [],
        symbol,
        interval,
        total: 0
      };
      
      // Cache empty result for shorter time
      cache.set(cacheKey, result, CacheTTL.BARS / 2);
      
      res.json(result);
    }
  } catch (error: any) {
    console.error('Last N bars fetch error:', error.response?.data || error.message);
    const trueDataError = handleTrueDataError(error);
    sendErrorResponse(res, trueDataError);
  }
});

export default router;