import express from 'express';
import axios from 'axios';
import { authenticateToken } from './auth';
import type { LTPResponse } from '../../shared/types';
import { handleTrueDataError, sendErrorResponse } from '../utils/errorHandler';
import { cache, CacheKeys, CacheTTL } from '../utils/cache';
import { ltpRateLimiter } from '../utils/rateLimiter';

const router = express.Router();

// Test endpoint to verify authentication
router.get('/test', authenticateToken, async (req: any, res) => {
  try {
    console.log('F&O test endpoint called by user:', req.user.username);
    res.json({
      success: true,
      message: 'F&O authentication working',
      user: req.user.username,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('F&O test error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed'
    });
  }
});

// Interface for F&O stock data
interface FNOStockData {
  symbol: string;
  spot: number;
  change: number;
  changePercent: number;
  volume: number;
  iv: number;
  ivRank: number;
  ivPercentile: number;
  gammaSignal: boolean;
  timestamp: string;
}

// Interface for F&O market summary
interface FNOMarketSummary {
  activeSignals: number;
  avgIV: number;
  topGainer: string;
  topLoser: string;
  totalStocks: number;
}

// Get F&O market data for top stocks
router.get('/market-data', authenticateToken, async (req: any, res) => {
  try {
    const { trueDataToken } = req.user;
    const cacheKey = 'fno_market_data';
    
    // Check cache first
    const cachedData = cache.get<FNOStockData[]>(cacheKey);
    if (cachedData) {
      return res.json({ 
        stocks: cachedData, 
        fromCache: true,
        timestamp: new Date().toISOString()
      });
    }

    // Top F&O stocks symbols
    const fnoSymbols = [
      'NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 
      'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'ASIANPAINT',
      'HCLTECH', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO',
      'WIPRO', 'NTPC', 'POWERGRID', 'M&M', 'TATAMOTORS', 'TATASTEEL', 'JSWSTEEL',
      'HDFC', 'BAJFINANCE', 'BAJAJFINSV', 'COALINDIA', 'GRASIM', 'ADANIPORTS',
      'ONGC', 'INDUSINDBK', 'TECHM', 'BPCL', 'SHREECEM', 'BRITANNIA', 'EICHERMOT',
      'DRREDDY', 'DIVISLAB', 'HEROMOTOCO', 'NESTLEIND', 'HINDALCO', 'CIPLA',
      'UPL', 'VEDL', 'SBILIFE', 'APOLLOHOSP'
    ];

    // Initialize validLTPData
    let validLTPData: Array<{
      symbol: string;
      ltp: number;
      volume: number;
      change: number;
      timestamp: string;
    }> = [];

    // Use our own working /api/data/ltp endpoint to get reliable data
    // This ensures we use the exact same logic that works in other parts of the app
    const prioritySymbols = [
      'NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'ASIANPAINT',
      'HCLTECH', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO'
    ];
    
    // Fetch only 15 symbols to start - can expand later
    const symbolsToFetch = prioritySymbols.slice(0, 15);
    console.log(`Fetching LTP for ${symbolsToFetch.length} symbols...`);
    
    try {
      // Fetch sequentially with delays to avoid rate limits
      const validLTPResults: Array<{
        symbol: string;
        ltp: number;
        volume: number;
        change: number;
        timestamp: string;
      }> = [];
      
      for (let i = 0; i < symbolsToFetch.length; i++) {
        const symbol = symbolsToFetch[i];
        
        // Add delay between requests (except first one)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        try {
          // Direct TrueData call - EXACT same as working /api/data/ltp endpoint
          const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
            params: {
              symbols: symbol,
              response: 'json'
            },
            headers: {
              'Authorization': `Bearer ${trueDataToken}`
            },
            timeout: 6000
          });

          // EXACT same parsing as working endpoint
          if (response.data && response.data.status === 'Success' && 
              response.data.Records && response.data.Records.length > 0) {
            const record = response.data.Records[0];
            
            // TrueData getLTPBulk returns: [symbolId, timestamp, price, volume, change]
            if (Array.isArray(record) && record.length >= 5) {
              const ltp = parseFloat(record[2] || 0); // price is at index 2
              const volume = parseInt(record[3] || 0); // volume is at index 3
              const change = parseFloat(record[4] || 0); // change is at index 4
              
              if (ltp > 0) {
                validLTPResults.push({
                  symbol: symbol,
                  ltp: ltp,
                  volume: volume,
                  change: change,
                  timestamp: record[1] || new Date().toISOString()
                });
                
                // Log first few successes
                if (i < 3) {
                  console.log(`✓ ${symbol} - Price: ${ltp}, Change: ${change}`);
                }
              }
            }
          }
        } catch (error: any) {
          // Log errors for first few only
          if (i < 3) {
            console.error(`✗ ${symbol} - Failed:`, error.response?.status || 'No status', error.message);
          }
          // Continue with next symbol
        }
      }

      validLTPData = validLTPResults;
      
      console.log(`\n=== F&O Market Data Fetch Summary ===`);
      console.log(`Total symbols requested: ${symbolsToFetch.length}`);
      console.log(`Successfully fetched: ${validLTPData.length} symbols`);
      
      if (validLTPData.length > 0) {
        const successfulSymbols = validLTPData.map(d => d.symbol);
        console.log(`Successful symbols:`, successfulSymbols.join(', '));
        
        // Log sample prices for verification
        const sbinData = validLTPData.find(d => d.symbol === 'SBIN');
        if (sbinData) {
          console.log(`SBIN - Price: ${sbinData.ltp}, Change: ${sbinData.change}`);
        }
      } else {
        console.error(`ERROR: No data fetched for any symbol!`);
        console.error(`This indicates a problem with the TrueData API or authentication`);
      }
      console.log(`=== End Summary ===\n`);
    } catch (bulkError: any) {
      console.error('Error in bulk LTP fetch:', bulkError.message || bulkError);
      console.error('Error details:', {
        response: bulkError.response?.data,
        status: bulkError.response?.status,
        message: bulkError.message
      });
      // Return empty array if bulk fetch fails completely - don't throw, just return empty
      validLTPData = [];
    }

    // Generate F&O stock data with mock IV data (since TrueData doesn't provide IV directly)
    const fnoStocks: FNOStockData[] = validLTPData.map((ltpData) => {
      try {
        // Ensure symbol is always a string
        const symbol = String(ltpData.symbol || 'UNKNOWN').trim();
        const spot = ltpData.ltp || 0;
        const change = ltpData.change || 0;
        const changePercent = spot > 0 && (spot - change) !== 0 ? (change / (spot - change)) * 100 : 0;
        const volume = ltpData.volume || 0;
        
        // Mock IV data (in real implementation, you'd fetch this from a separate API)
        const iv = 15 + Math.random() * 20; // 15-35% range
        const ivRank = Math.random() * 100;
        const ivPercentile = Math.random() * 100;
        
        // Gamma signal logic - ensure symbol is string before using includes
        const symbolUpper = symbol.toUpperCase();
        const gammaSignal = Math.abs(changePercent) > (symbolUpper.includes('NIFTY') ? 1.5 : 2.0);

        return {
          symbol,
          spot: isNaN(spot) ? 0 : spot,
          change: isNaN(change) ? 0 : change,
          changePercent: isNaN(changePercent) ? 0 : parseFloat(changePercent.toFixed(2)),
          volume: isNaN(volume) ? 0 : volume,
          iv: parseFloat(iv.toFixed(1)),
          ivRank: parseFloat(ivRank.toFixed(0)),
          ivPercentile: parseFloat(ivPercentile.toFixed(0)),
          gammaSignal,
          timestamp: ltpData.timestamp || new Date().toISOString()
        };
      } catch (mapError: any) {
        console.error('Error mapping LTP data:', mapError);
        return null;
      }
    }).filter((stock): stock is FNOStockData => stock !== null);

    // Cache the data for 30 seconds if we have data
    if (fnoStocks.length > 0) {
      cache.set(cacheKey, fnoStocks, CacheTTL.SHORT);
    }

    console.log(`Returning ${fnoStocks.length} stocks to frontend`);

    res.json({
      stocks: fnoStocks,
      fromCache: false,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('F&O market data fetch error:', error.response?.data || error.message);
    console.error('Full error:', error);
    
    // Always return a response, even if empty, to avoid 500 errors
    try {
      const trueDataError = handleTrueDataError(error);
      sendErrorResponse(res, trueDataError);
    } catch (handlerError: any) {
      // If error handler fails, return empty data instead of crashing
      console.error('Error handler failed, returning empty data:', handlerError);
      res.status(200).json({
        stocks: [],
        fromCache: false,
        timestamp: new Date().toISOString(),
        error: 'Failed to fetch market data. Please try again later.'
      });
    }
  }
});

// Get F&O market summary
router.get('/market-summary', authenticateToken, async (req: any, res) => {
  try {
    const { trueDataToken } = req.user;
    const cacheKey = 'fno_market_summary';
    
    // Check cache first
    const cachedData = cache.get<FNOMarketSummary>(cacheKey);
    if (cachedData) {
      return res.json({ 
        summary: cachedData, 
        fromCache: true,
        timestamp: new Date().toISOString()
      });
    }

    // Initialize variables
    const fnoSymbols = [
      'NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 
      'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'ASIANPAINT',
      'HCLTECH', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO',
      'WIPRO', 'NTPC', 'POWERGRID', 'M&M', 'TATAMOTORS', 'TATASTEEL', 'JSWSTEEL',
      'HDFC', 'BAJFINANCE', 'BAJAJFINSV', 'COALINDIA', 'GRASIM', 'ADANIPORTS',
      'ONGC', 'INDUSINDBK', 'TECHM', 'BPCL', 'SHREECEM', 'BRITANNIA', 'EICHERMOT',
      'DRREDDY', 'DIVISLAB', 'HEROMOTOCO', 'NESTLEIND', 'HINDALCO', 'CIPLA',
      'UPL', 'VEDL', 'SBILIFE', 'APOLLOHOSP'
    ];

    let validLTPData: Array<{
      symbol: string;
      ltp: number;
      volume: number;
      change: number;
      timestamp: string;
    }> = [];

    // Use same approach as market-data - reuse the fetched data if available
    // Otherwise fetch same priority symbols
    const prioritySymbols = [
      'NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'ASIANPAINT',
      'HCLTECH', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO'
    ];
    
    const symbolsToFetch = prioritySymbols.slice(0, 20);
    console.log(`[Market Summary] Fetching LTP for ${symbolsToFetch.length} symbols...`);

    try {
      const ltpPromises = symbolsToFetch.map(async (symbol, index) => {
        if (index > 0 && index % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        try {
          // EXACT format from working endpoint
          const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
            params: {
              symbols: symbol,
              response: 'json'
            },
            headers: {
              'Authorization': `Bearer ${trueDataToken}`
            },
            timeout: 8000
          });

          if (response.data && response.data.status === 'Success' && 
              response.data.Records && response.data.Records.length > 0) {
            const record = response.data.Records[0];
            
            if (Array.isArray(record) && record.length >= 5) {
              const ltp = parseFloat(record[2] || 0);
              const volume = parseInt(record[3] || 0);
              const change = parseFloat(record[4] || 0);
              
              if (ltp > 0) {
                return {
                  symbol: symbol,
                  ltp: ltp,
                  volume: volume,
                  change: change,
                  timestamp: record[1] || new Date().toISOString()
                };
              }
            }
          }
          return null;
        } catch (error: any) {
          return null;
        }
      });

      validLTPData = ltpResults;
      console.log(`[Market Summary] Successfully fetched ${validLTPData.length} symbols`);
    } catch (bulkError: any) {
      console.error('[Market Summary] Error in bulk LTP fetch:', bulkError.message || bulkError);
      validLTPData = [];
    }

    // Generate F&O stock data with proper error handling
    const stocks: FNOStockData[] = validLTPData.map((ltpData) => {
      try {
        // Ensure symbol is always a string
        const symbol = String(ltpData.symbol || 'UNKNOWN').trim();
        const spot = ltpData.ltp || 0;
        const change = ltpData.change || 0;
        const changePercent = spot > 0 && (spot - change) !== 0 ? (change / (spot - change)) * 100 : 0;
        const volume = ltpData.volume || 0;
        
        const iv = 15 + Math.random() * 20;
        const ivRank = Math.random() * 100;
        const ivPercentile = Math.random() * 100;
        
        // Gamma signal logic - ensure symbol is string before using includes
        const symbolUpper = symbol.toUpperCase();
        const gammaSignal = Math.abs(changePercent) > (symbolUpper.includes('NIFTY') ? 1.5 : 2.0);

        return {
          symbol,
          spot: isNaN(spot) ? 0 : spot,
          change: isNaN(change) ? 0 : change,
          changePercent: isNaN(changePercent) ? 0 : parseFloat(changePercent.toFixed(2)),
          volume: isNaN(volume) ? 0 : volume,
          iv: parseFloat(iv.toFixed(1)),
          ivRank: parseFloat(ivRank.toFixed(0)),
          ivPercentile: parseFloat(ivPercentile.toFixed(0)),
          gammaSignal,
          timestamp: ltpData.timestamp || new Date().toISOString()
        };
      } catch (mapError: any) {
        console.error('[Market Summary] Error mapping LTP data:', mapError);
        return null;
      }
    }).filter((stock): stock is FNOStockData => stock !== null);

    // Calculate summary with safe handling for empty arrays
    const activeSignals = stocks.filter(s => s && s.gammaSignal).length;
    const avgIV = stocks.length > 0 ? 
      stocks.reduce((sum, s) => sum + (s.iv || 0), 0) / stocks.length : 0;
    
    let topGainer = '';
    let topLoser = '';
    
    if (stocks.length > 0) {
      try {
        const sortedByChange = [...stocks].sort((a, b) => (b.change || 0) - (a.change || 0));
        topGainer = sortedByChange[0]?.symbol || '';
        topLoser = sortedByChange[sortedByChange.length - 1]?.symbol || '';
      } catch (sortError: any) {
        console.error('[Market Summary] Error sorting stocks:', sortError);
        topGainer = stocks[0]?.symbol || '';
        topLoser = stocks[0]?.symbol || '';
      }
    }

    const summary: FNOMarketSummary = {
      activeSignals: isNaN(activeSignals) ? 0 : activeSignals,
      avgIV: isNaN(avgIV) ? 0 : parseFloat(avgIV.toFixed(1)),
      topGainer,
      topLoser,
      totalStocks: stocks.length
    };

    console.log(`Market summary: ${stocks.length} stocks, ${activeSignals} signals, avgIV: ${isNaN(avgIV) ? 0 : avgIV.toFixed(1)}%`);

    // Cache the summary for 30 seconds if we have data
    if (stocks.length > 0) {
      cache.set(cacheKey, summary, CacheTTL.SHORT);
    }

    res.json({
      summary,
      fromCache: false,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('F&O market summary fetch error:', error.response?.data || error.message);
    console.error('Full error:', error);
    
    // Always return a response, even if empty, to avoid 500 errors
    try {
      const trueDataError = handleTrueDataError(error);
      sendErrorResponse(res, trueDataError);
    } catch (handlerError: any) {
      // If error handler fails, return empty summary instead of crashing
      console.error('Error handler failed, returning empty summary:', handlerError);
      res.status(200).json({
        summary: {
          activeSignals: 0,
          avgIV: 0,
          topGainer: '',
          topLoser: '',
          totalStocks: 0
        },
        fromCache: false,
        timestamp: new Date().toISOString(),
        error: 'Failed to fetch market summary. Please try again later.'
      });
    }
  }
});

// Get option chain for a specific F&O symbol
router.get('/option-chain/:symbol', authenticateToken, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { expiry } = req.query;
    const { trueDataToken } = req.user;

    // Format expiry from yyyy-MM-dd to dd-MM-yyyy if needed
    const formatExpiryParam = (expiry?: string): string => {
      if (!expiry) return '';
      const m = expiry.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const [_, yyyy, mm, dd] = m;
        return `${dd}-${mm}-${yyyy}`;
      }
      return expiry;
    };

    const formattedExpiry = formatExpiryParam(expiry as string);

    // Build params; include expiry ONLY if provided
    const params: Record<string, any> = {
      symbol,
      response: 'json',
      segment: 'fo'
    };
    if (formattedExpiry) {
      params.expiry = formattedExpiry;
    }

    // Call Analytics API directly
    const response = await axios.get(`https://analytics.truedata.in/api/getoptionchain`, {
      params,
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    let options: any[] = [];
    let underlyingPrice = 0;
    let effectiveExpiry = formattedExpiry || '';

    const data = response.data;

    if (data && Array.isArray(data.Records)) {
      // Handle flat array format from TrueData Analytics API
      (data.Records as any[]).forEach((record: any) => {
        if (Array.isArray(record) && record.length >= 20) {
          const strike = record[3];
          const ceLtp = record[4];
          const peLtp = record[11];
          
          if (strike && strike !== null) {
            // Add CE option if LTP exists
            if (ceLtp && ceLtp !== null) {
              options.push({
                symbol: symbol,
                optionSymbol: `${symbol}${strike}CE`,
                strike: parseFloat(strike),
                series: 'CE',
                expiry: effectiveExpiry,
                ltp: parseFloat(ceLtp),
                delta: 0,
                gamma: 0,
                theta: 0,
                vega: 0,
                timestamp: new Date().toISOString()
              });
            }
            
            // Add PE option if LTP exists
            if (peLtp && peLtp !== null) {
              options.push({
                symbol: symbol,
                optionSymbol: `${symbol}${strike}PE`,
                strike: parseFloat(strike),
                series: 'PE',
                expiry: effectiveExpiry,
                ltp: parseFloat(peLtp),
                delta: 0,
                gamma: 0,
                theta: 0,
                vega: 0,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      });
    }

    // Fetch underlying price
    try {
      const ltpResponse = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
        params: {
          symbols: symbol,
          response: 'json'
        },
        headers: {
          'Authorization': `Bearer ${trueDataToken}`
        }
      });

      const ltpData = ltpResponse.data;
      if (ltpData && ltpData.status === 'Success' && Array.isArray(ltpData.Records) && ltpData.Records.length > 0) {
        const record = ltpData.Records[0];
        underlyingPrice = parseFloat(record[2] || 0);
      }
    } catch (ltpError) {
      console.warn('Failed to fetch underlying price:', (ltpError as any).message);
    }

    const chainResponse = {
      options,
      underlyingPrice,
      expiry: effectiveExpiry
    };

    res.json(chainResponse);

  } catch (error: any) {
    console.error('F&O option chain fetch error:', error.response?.data || error.message);
    const trueDataError = handleTrueDataError(error);
    sendErrorResponse(res, trueDataError);
  }
});

export default router;

