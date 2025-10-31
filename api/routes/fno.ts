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

// Debug endpoint to test route registration
router.get('/routes', (req: any, res) => {
  res.json({
    message: 'F&O routes are registered',
    availableRoutes: [
      '/api/fno/test',
      '/api/fno/market-data',
      '/api/fno/market-summary',
      '/api/fno/option-chain/:symbol'
    ],
    timestamp: new Date().toISOString()
  });
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
  // Declare variables outside try block so they're available in catch
  const { symbol } = req.params;
  const { expiry } = req.query;
  
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

  // Auto-detect expiry from TrueData API if not provided
  // Declare outside try so it's available in catch block
  let formattedExpiry = formatExpiryParam(expiry as string);
  let response: any;
  
  try {
    console.log(`[Option Chain] Request received for symbol: ${symbol}, expiry: ${expiry || 'none'}`);
    console.log(`[Option Chain] User authenticated:`, req.user?.username);
    console.log(`[Option Chain] Has trueDataToken:`, !!req.user?.trueDataToken);
    
    if (!req.user?.trueDataToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token missing'
      });
    }
    
    const { trueDataToken } = req.user;
    
    // If no expiry provided, we need to auto-detect it
    if (!formattedExpiry) {
      console.log(`[Option Chain ${symbol}] No expiry provided, auto-detecting from TrueData API...`);
      
      // Strategy: Try a known expiry date (November 25, 2024) or try without expiry first
      // Based on your example, November expiry is 25-11-2024
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1; // 1-12
      
      // Try known expiries for current/next month
      // Updated to 2025 dates
      const knownExpiries = [
        '25-11-2025', // November 2025
        '26-12-2025', // December 2025
        '30-01-2026', // January 2026
      ];
      
      // Try each known expiry until we get valid data
      let foundValidExpiry = false;
      for (const testExpiry of knownExpiries) {
        try {
          console.log(`[Option Chain ${symbol}] Trying expiry: ${testExpiry}`);
          const testResponse = await axios.get('https://analytics.truedata.in/api/getoptionchain', {
            params: {
              symbol,
              expiry: testExpiry,
              response: 'json'
            },
            headers: {
              'Authorization': `Bearer ${trueDataToken}`
            },
            timeout: 8000
          });
          
          // If we get valid data (Records array with data), this is the right expiry
          if (testResponse.data && testResponse.data.Records && Array.isArray(testResponse.data.Records) && testResponse.data.Records.length > 0) {
            formattedExpiry = testExpiry;
            response = testResponse; // Use this response directly
            foundValidExpiry = true;
            console.log(`[Option Chain ${symbol}] ✅ Found valid expiry: ${formattedExpiry} (got ${testResponse.data.Records.length} records)`);
            break;
          }
        } catch (testErr: any) {
          // Try next expiry
          continue;
        }
      }
      
      // If we found valid data, use it. Otherwise, make a final API call
      if (!foundValidExpiry) {
        console.warn(`[Option Chain ${symbol}] Could not auto-detect expiry, trying API call without expiry...`);
        // Make one final attempt with a calculated expiry (current month's known expiry)
        const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        const calculatedExpiry = monthKey === '2025-11' ? '25-11-2025' : 
                                 monthKey === '2025-12' ? '26-12-2025' :
                                 monthKey === '2026-01' ? '30-01-2026' : '25-11-2025'; // Default fallback (Nov 2025)
        
        formattedExpiry = calculatedExpiry;
        console.log(`[Option Chain ${symbol}] Using calculated expiry: ${formattedExpiry}`);
      }
    }
    
    // Make API call if we don't already have response data
    if (!response) {
      const params: Record<string, any> = {
        symbol,
        expiry: formattedExpiry, // ALWAYS include expiry (it's required)
        response: 'json'
      };
      
      console.log(`[Option Chain ${symbol}] Calling TrueData API with params:`, params);
      
      response = await axios.get('https://analytics.truedata.in/api/getoptionchain', {
        params,
        headers: {
          'Authorization': `Bearer ${trueDataToken}`
        },
        timeout: 15000
      });
      
      console.log(`[Option Chain ${symbol}] TrueData API response status:`, response.status);
      console.log(`[Option Chain ${symbol}] Response data keys:`, response.data ? Object.keys(response.data) : 'no data');
    }

    let options: any[] = [];
    let underlyingPrice = 0;
    let effectiveExpiry = formattedExpiry; // Use the calculated/formatted expiry

    const data = response.data;

    // Log response structure for debugging
    console.log(`[Option Chain ${symbol}] Response keys:`, data ? Object.keys(data) : 'no data');
    console.log(`[Option Chain ${symbol}] Has Records:`, !!data?.Records);
    console.log(`[Option Chain ${symbol}] Records type:`, Array.isArray(data?.Records) ? 'array' : typeof data?.Records);

    if (data) {
      // Handle options array format
      if (Array.isArray(data.options)) {
        options = (data.options as any[]).map((item: any) => ({
          symbol: item.symbol || symbol,
          optionSymbol: item.optionSymbol || item.OptionSymbol || '',
          strike: parseFloat(item.strike || item.Strike || 0),
          series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
          expiry: item.expiry || item.Expiry || effectiveExpiry,
          ltp: parseFloat(item.ltp || item.LTP || 0),
          delta: parseFloat(item.delta || item.Delta || 0),
          gamma: parseFloat(item.gamma || item.Gamma || 0),
          theta: parseFloat(item.theta || item.Theta || 0),
          vega: parseFloat(item.vega || item.Vega || 0),
          timestamp: new Date().toISOString()
        }));
        underlyingPrice = parseFloat(data.underlyingPrice || underlyingPrice || 0);
        effectiveExpiry = data.expiry || effectiveExpiry;
      }
      // Handle Records array format (TrueData Analytics API format)
      else if (Array.isArray(data.Records)) {
        const seenStrikes = new Set<number>();
        
        (data.Records as any[]).forEach((record: any) => {
          if (Array.isArray(record) && record.length >= 20) {
            const strike = parseFloat(record[3] || 0);
            const ceLtp = record[4];
            const peLtp = record[11];
            
            // Extract expiry from record if available
            if (!effectiveExpiry && record[0]) {
              effectiveExpiry = String(record[0]).substring(0, 10) || effectiveExpiry;
            }
            
            if (strike > 0 && !seenStrikes.has(strike)) {
              seenStrikes.add(strike);
              
              // Add CE option if LTP exists
              if (ceLtp !== null && ceLtp !== undefined && !isNaN(parseFloat(ceLtp))) {
                options.push({
                  symbol: symbol,
                  optionSymbol: `${symbol}${strike}CE`,
                  strike: strike,
                  series: 'CE',
                  expiry: effectiveExpiry,
                  ltp: parseFloat(ceLtp),
                  delta: parseFloat(record[5] || 0), // Delta might be in record[5]
                  gamma: parseFloat(record[6] || 0), // Gamma might be in record[6]
                  theta: parseFloat(record[7] || 0), // Theta might be in record[7]
                  vega: parseFloat(record[8] || 0), // Vega might be in record[8]
                  timestamp: new Date().toISOString()
                });
              }
              
              // Add PE option if LTP exists
              if (peLtp !== null && peLtp !== undefined && !isNaN(parseFloat(peLtp))) {
                options.push({
                  symbol: symbol,
                  optionSymbol: `${symbol}${strike}PE`,
                  strike: strike,
                  series: 'PE',
                  expiry: effectiveExpiry,
                  ltp: parseFloat(peLtp),
                  delta: parseFloat(record[12] || 0), // PE Delta might be in record[12]
                  gamma: parseFloat(record[13] || 0), // PE Gamma might be in record[13]
                  theta: parseFloat(record[14] || 0), // PE Theta might be in record[14]
                  vega: parseFloat(record[15] || 0), // PE Vega might be in record[15]
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        });
        
        console.log(`[Option Chain ${symbol}] Parsed ${options.length} options from Records array`);
      }
      // Handle object with nested structure
      else if (data.Records && typeof data.Records === 'object' && !Array.isArray(data.Records)) {
        // Try to extract options from object structure
        const recordsObj = data.Records as any;
        Object.keys(recordsObj).forEach((key) => {
          const record = recordsObj[key];
          if (Array.isArray(record) && record.length >= 20) {
            const strike = parseFloat(record[3] || 0);
            const ceLtp = record[4];
            const peLtp = record[11];
            
            if (strike > 0) {
              if (ceLtp !== null && ceLtp !== undefined && !isNaN(parseFloat(ceLtp))) {
                options.push({
                  symbol: symbol,
                  optionSymbol: `${symbol}${strike}CE`,
                  strike: strike,
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
              
              if (peLtp !== null && peLtp !== undefined && !isNaN(parseFloat(peLtp))) {
                options.push({
                  symbol: symbol,
                  optionSymbol: `${symbol}${strike}PE`,
                  strike: strike,
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
    }

    console.log(`[Option Chain ${symbol}] Total options: ${options.length}`);

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

    console.log(`[Option Chain ${symbol}] ✅ Successfully parsed ${options.length} options`);
    console.log(`[Option Chain ${symbol}] Sample option:`, options.length > 0 ? {
      symbol: options[0].symbol,
      strike: options[0].strike,
      series: options[0].series,
      ltp: options[0].ltp
    } : 'No options');
    console.log(`[Option Chain ${symbol}] Returning to frontend:`, {
      optionsCount: options.length,
      underlyingPrice,
      expiry: effectiveExpiry
    });
    
    res.json(chainResponse);

  } catch (error: any) {
    console.error(`[Option Chain ${symbol}] Error:`, error.message);
    console.error(`[Option Chain ${symbol}] Error status:`, error.response?.status);
    console.error(`[Option Chain ${symbol}] Error data:`, error.response?.data);
    
    // Return empty data instead of error to prevent frontend from hanging
    // This allows the UI to show "No data" instead of infinite loading
    // formattedExpiry is declared outside try block, so it's available here
    res.status(200).json({
      options: [],
      underlyingPrice: 0,
      expiry: formattedExpiry || '',
      error: error.message || 'Failed to fetch option chain'
    });
  }
});

// Catch-all route handler - MUST be last to not interfere with other routes
router.use('*', (req: any, res: any) => {
  console.error(`[FNO Router] ⚠️  Unmatched route: ${req.method} ${req.originalUrl}`);
  console.error(`[FNO Router] This suggests the route pattern didn't match`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    hint: 'Make sure you are calling: GET /api/fno/option-chain/:symbol',
    availableRoutes: [
      'GET /api/fno/test',
      'GET /api/fno/market-data',
      'GET /api/fno/market-summary',
      'GET /api/fno/option-chain/:symbol',
      'GET /api/fno/routes (debug)'
    ]
  });
});

export default router;

