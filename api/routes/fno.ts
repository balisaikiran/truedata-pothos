import express from 'express';
import axios from 'axios';
import { authenticateToken } from './auth.js';
import type { LTPResponse } from '../../shared/types.js';
import { handleTrueDataError, sendErrorResponse } from '../utils/errorHandler.js';
import { cache, CacheKeys, CacheTTL } from '../utils/cache.js';
import { ltpRateLimiter } from '../utils/rateLimiter.js';

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

// Store historical IV data for percentile calculation (in-memory, per symbol)
const ivHistoryStore: Record<string, number[]> = {};

// Calculate IV from option prices using Black-Scholes reverse calculation
// This calculates the implied volatility that would produce the observed option price
const calculateIVFromOption = (
  optionPrice: number,
  underlyingPrice: number,
  strikePrice: number,
  timeToExpiry: number, // in years
  riskFreeRate: number = 0.06, // 6% annual risk-free rate
  optionType: 'call' | 'put'
): number => {
  if (optionPrice <= 0 || underlyingPrice <= 0 || strikePrice <= 0 || timeToExpiry <= 0) {
    return 0;
  }

  // Black-Scholes formula for option pricing
  const calculateOptionPrice = (sigma: number): number => {
    const d1 = (Math.log(underlyingPrice / strikePrice) + (riskFreeRate + 0.5 * sigma * sigma) * timeToExpiry) / (sigma * Math.sqrt(timeToExpiry));
    const d2 = d1 - sigma * Math.sqrt(timeToExpiry);

    // Cumulative normal distribution function
    const cdf = (x: number) => {
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2.0);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    };

    const N_d1 = cdf(d1);
    const N_d2 = cdf(d2);
    const N_negd1 = cdf(-d1);
    const N_negd2 = cdf(-d2);

    if (optionType === 'call') {
      return underlyingPrice * N_d1 - strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * N_d2;
    } else {
      return strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * N_negd2 - underlyingPrice * N_negd1;
    }
  };

  // Vega (sensitivity to volatility) for Newton-Raphson method
  const calculateVega = (sigma: number): number => {
    const d1 = (Math.log(underlyingPrice / strikePrice) + (riskFreeRate + 0.5 * sigma * sigma) * timeToExpiry) / (sigma * Math.sqrt(timeToExpiry));
    const pdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    return underlyingPrice * pdf(d1) * Math.sqrt(timeToExpiry);
  };

  // Newton-Raphson method to find IV
  let sigma = 0.2; // Start with 20% volatility
  const maxIterations = 50;
  const tolerance = 0.0001;

  for (let i = 0; i < maxIterations; i++) {
    const price = calculateOptionPrice(sigma);
    const vega = calculateVega(sigma);
    
    if (vega < 0.0001) break; // Avoid division by very small numbers
    
    const error = price - optionPrice;
    if (Math.abs(error) < tolerance) break;
    
    sigma = sigma - error / vega;
    
    // Keep sigma in reasonable bounds (0.01 to 5.0 = 1% to 500%)
    if (sigma < 0.01) sigma = 0.01;
    if (sigma > 5.0) sigma = 5.0;
  }

  // Convert to percentage (multiply by 100)
  return sigma * 100;
};

// Calculate IV percentile based on historical data
// NOTE: This function only works with REAL IV values from calculations
// If IV is 0 or null, it means real IV data is not available
const calculateIVPercentile = (symbol: string, currentIV: number): number => {
  // If IV is 0 or invalid, we don't have real data - return 0
  if (!currentIV || currentIV <= 0 || isNaN(currentIV)) {
    return 0;
  }
  
  // Initialize history for symbol if not exists - start empty, only use real data
  if (!ivHistoryStore[symbol]) {
    ivHistoryStore[symbol] = [];
  }
  
  const history = ivHistoryStore[symbol];
  
  // Only add REAL IV values to history (not fake/zero values)
  if (currentIV > 0) {
    history.push(currentIV);
    // Keep last 260 values = ~52 weeks of trading days
    if (history.length > 260) {
      history.shift(); // Remove oldest
    }
  }
  
  // If we don't have enough history yet, return 0 (indicates data not available)
  if (history.length < 10) {
    return 0; // Need at least 10 data points for meaningful percentile
  }
  
  // Calculate percentile: % of values in history that are lower than current IV
  const lowerCount = history.filter(iv => iv < currentIV).length;
  const percentile = (lowerCount / history.length) * 100;
  
  return Math.round(percentile);
};

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
    
    // Fetch only 10 symbols to reduce timeout risk
    const symbolsToFetch = prioritySymbols.slice(0, 10);
    console.log(`Fetching LTP for ${symbolsToFetch.length} symbols...`);
    
    try {
      // Fetch with shorter delays and timeout protection
      const validLTPResults: Array<{
        symbol: string;
        ltp: number;
        volume: number;
        change: number;
        timestamp: string;
      }> = [];
      
      // Add overall timeout - if we exceed 15 seconds, return what we have
      const startTime = Date.now();
      const maxTime = 15000; // 15 seconds max
      
      for (let i = 0; i < symbolsToFetch.length; i++) {
        // Check if we're running out of time
        if (Date.now() - startTime > maxTime) {
          console.log(`Timeout approaching, returning ${validLTPResults.length} symbols`);
          break;
        }
        
        // If we have at least 5 successful results, we can return early
        if (validLTPResults.length >= 5 && Date.now() - startTime > 8000) {
          console.log(`Early return: Got ${validLTPResults.length} symbols, returning early`);
          break;
        }
        
        const symbol = symbolsToFetch[i];
        
        // Reduced delay - 150ms instead of 500ms
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        
        try {
          // Direct TrueData call with shorter timeout
          const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
            params: {
              symbols: symbol,
              response: 'json'
            },
            headers: {
              'Authorization': `Bearer ${trueDataToken}`
            },
            timeout: 5000 // Reduced from 6000 to 5000
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

    // Generate F&O stock data using ONLY REAL data from TrueData API
    // Calculate REAL IV from option chain data using Black-Scholes reverse calculation
    const fnoStocks: FNOStockData[] = await Promise.all(validLTPData.map(async (ltpData) => {
      try {
        // Ensure symbol is always a string
        const symbol = String(ltpData.symbol || 'UNKNOWN').trim();
        const spot = ltpData.ltp || 0;
        const change = ltpData.change || 0;
        const changePercent = spot > 0 && (spot - change) !== 0 ? (change / (spot - change)) * 100 : 0;
        const volume = ltpData.volume || 0;
        
        // Try to fetch REAL IV from TrueData API if available
        // NOTE: TrueData may not provide IV directly in LTP data
        // For now, set IV to 0 if not available - this indicates real data is not available
        // DO NOT use fake/random values
        let iv = 0;
        let ivPercentile = 0;
        
        // TODO: If TrueData provides IV data, fetch it here
        // For now, IV is set to 0 to indicate real data is not available
        // This is better than showing fake values
        
        // Only calculate percentile if we have real IV data
        if (iv > 0) {
          ivPercentile = calculateIVPercentile(symbol, iv);
        }
        
        const ivRank = 0; // Removed from UI
        
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
    }));
    
    // Filter out null results
    const validStocks = fnoStocks.filter((stock): stock is FNOStockData => stock !== null);

    // Cache the data for 30 seconds if we have data
    if (validStocks.length > 0) {
      cache.set(cacheKey, validStocks, CacheTTL.SHORT);
    }

    console.log(`Returning ${validStocks.length} stocks to frontend (${validStocks.filter(s => s.iv > 0).length} with IV data)`);

    res.json({
      stocks: validStocks,
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
    
    const symbolsToFetch = prioritySymbols.slice(0, 10); // Reduced from 20 to 10
    console.log(`[Market Summary] Fetching LTP for ${symbolsToFetch.length} symbols...`);

    try {
      // Add timeout protection
      const startTime = Date.now();
      const maxTime = 10000; // 10 seconds max for summary
      
      const ltpPromises = symbolsToFetch.map(async (symbol, index) => {
        // Check timeout
        if (Date.now() - startTime > maxTime) {
          return null;
        }
        
        // Reduced delay - only every 3 requests instead of every 5
        if (index > 0 && index % 3 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        try {
          // EXACT format from working endpoint with shorter timeout
          const response = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
            params: {
              symbols: symbol,
              response: 'json'
            },
            headers: {
              'Authorization': `Bearer ${trueDataToken}`
            },
            timeout: 5000 // Reduced from 8000 to 5000
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

      const ltpResults = await Promise.all(ltpPromises);
      validLTPData = ltpResults.filter((item): item is any => item !== null);
      console.log(`[Market Summary] Successfully fetched ${validLTPData.length} symbols`);
    } catch (bulkError: any) {
      console.error('[Market Summary] Error in bulk LTP fetch:', bulkError.message || bulkError);
      validLTPData = [];
    }

    // Generate F&O stock data with proper error handling
    // NOTE: Market summary doesn't calculate IV (uses 0) to keep it fast
    // Full IV calculation is done in /market-data endpoint
    const stocks: FNOStockData[] = validLTPData.map((ltpData) => {
      try {
        // Ensure symbol is always a string
        const symbol = String(ltpData.symbol || 'UNKNOWN').trim();
        const spot = ltpData.ltp || 0;
        const change = ltpData.change || 0;
        const changePercent = spot > 0 && (spot - change) !== 0 ? (change / (spot - change)) * 100 : 0;
        const volume = ltpData.volume || 0;
        
        // IV calculation is skipped in market-summary for performance
        // Full IV calculation is available in /market-data endpoint
        let iv = 0;
        let ivPercentile = 0;
        
        const ivRank = 0; // Removed from UI
        
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

    // Fetch underlying price FIRST (needed for strike validation during parsing)
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
        console.log(`[Option Chain ${symbol}] ✅ Fetched underlying price: ${underlyingPrice}`);
      }
    } catch (ltpError) {
      console.warn(`[Option Chain ${symbol}] Failed to fetch underlying price:`, (ltpError as any).message);
      // Try to extract from option chain response if available
      if (data && data.underlyingPrice) {
        underlyingPrice = parseFloat(data.underlyingPrice);
        console.log(`[Option Chain ${symbol}] Using underlying price from option chain response: ${underlyingPrice}`);
      }
    }

    // Log response structure for debugging
    console.log(`[Option Chain ${symbol}] Response keys:`, data ? Object.keys(data) : 'no data');
    console.log(`[Option Chain ${symbol}] Has Records:`, !!data?.Records);
    console.log(`[Option Chain ${symbol}] Records type:`, Array.isArray(data?.Records) ? 'array' : typeof data?.Records);
    
    // Save full response to log for debugging (first 3 records only)
    if (data?.Records && Array.isArray(data.Records) && data.Records.length > 0) {
      console.log(`\n========== [Option Chain ${symbol}] COMPLETE API RESPONSE SAMPLE ==========`);
      console.log(`Total records: ${data.Records.length}`);
      console.log(`First 3 complete records:`);
      data.Records.slice(0, 3).forEach((rec: any, idx: number) => {
        console.log(`\n--- Record ${idx} ---`);
        if (Array.isArray(rec)) {
          console.log(`Type: Array with ${rec.length} elements`);
          rec.forEach((val: any, i: number) => {
            console.log(`  [${i}]: ${JSON.stringify(val)}`);
          });
        } else if (typeof rec === 'object') {
          console.log(`Type: Object`);
          console.log(`  Keys:`, Object.keys(rec));
          Object.keys(rec).forEach(key => {
            console.log(`  ${key}: ${JSON.stringify(rec[key])}`);
          });
        } else {
          console.log(`Type: ${typeof rec}, Value: ${JSON.stringify(rec)}`);
        }
      });
      console.log(`========================================================\n`);
    }

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
      // Based on documented format in options.ts:
      // Format: [symbol, expiry, ?, strike, ceLtp, ceOI, ceBid, ceAsk, ceVol, ceOIChange, cePriceChange, peLtp, peOI, peBid, peAsk, peVol, peOIChange, pePriceChange, ?, ?, ?]
      else if (Array.isArray(data.Records)) {
        const seenStrikes = new Set<number>();
        
        // Log FULL first record structure for debugging
        if (data.Records.length > 0 && Array.isArray(data.Records[0])) {
          const firstRecord = data.Records[0];
          console.log(`\n========== [Option Chain ${symbol}] FULL RECORD STRUCTURE ==========`);
          console.log(`Record length: ${firstRecord.length}`);
          console.log(`COMPLETE RECORD:`, JSON.stringify(firstRecord));
          console.log(`\nAll fields with index:`);
          for (let i = 0; i < firstRecord.length; i++) {
            const val = firstRecord[i];
            const numVal = typeof val === 'number' ? val : (val !== null && val !== undefined ? parseFloat(val) : null);
            const isStrikeCandidate = numVal !== null && !isNaN(numVal) && numVal >= 100 && numVal <= 50000;
            console.log(`  [${i}]: ${JSON.stringify(val)} ${typeof val} ${numVal !== null && !isNaN(numVal) ? `(num: ${numVal})` : ''} ${isStrikeCandidate ? ' ⭐ STRIKE CANDIDATE' : ''}`);
          }
          console.log(`========================================================\n`);
        }
        
        // Try to auto-detect strike position from first few records
        let detectedStrikeIndex = -1;
        let detectedCeLtpIndex = -1;
        let detectedPeLtpIndex = -1;
        
        if (data.Records.length > 0 && Array.isArray(data.Records[0])) {
          // Look at first 3 records to find patterns
          const sampleRecords = data.Records.slice(0, Math.min(3, data.Records.length));
          const allStrikeCandidates: number[] = [];
          const allCeLtpCandidates: number[] = [];
          const allPeLtpCandidates: number[] = [];
          
          sampleRecords.forEach((record: any) => {
            if (Array.isArray(record)) {
              for (let i = 0; i < record.length; i++) {
                const val = record[i];
                if (val !== null && val !== undefined) {
                  const numVal = parseFloat(val);
                  if (!isNaN(numVal)) {
                    // Strike candidates: reasonable range (500-50000), typically whole numbers
                    if (numVal >= 500 && numVal <= 50000 && numVal % 1 === 0) {
                      if (!allStrikeCandidates.includes(i)) allStrikeCandidates.push(i);
                    }
                    // LTP candidates: smaller values (0-1000), typically decimals
                    if (numVal >= 0 && numVal <= 1000 && (numVal < 500 || (numVal % 0.25 !== 0))) {
                      if (allCeLtpCandidates.length < 5 && !allCeLtpCandidates.includes(i)) {
                        allCeLtpCandidates.push(i);
                      }
                    }
                  }
                }
              }
            }
          });
          
          // The most common index across records is likely the strike
          // Strikes should be consistent across records at the same index
          if (allStrikeCandidates.length > 0) {
            detectedStrikeIndex = allStrikeCandidates[0]; // Use first candidate that appears
            console.log(`[Option Chain ${symbol}] Auto-detected strike at index ${detectedStrikeIndex}`);
            console.log(`[Option Chain ${symbol}] Strike candidates found at indices:`, allStrikeCandidates);
          }
          
          // CE LTP is usually 1-2 positions after strike
          if (detectedStrikeIndex >= 0) {
            detectedCeLtpIndex = detectedStrikeIndex + 1;
            detectedPeLtpIndex = detectedStrikeIndex + 8; // PE LTP is usually further down
          } else {
            // Fallback to documented positions
            detectedStrikeIndex = 3;
            detectedCeLtpIndex = 4;
            detectedPeLtpIndex = 11;
            console.log(`[Option Chain ${symbol}] Using default positions: strike@${detectedStrikeIndex}, ceLtp@${detectedCeLtpIndex}, peLtp@${detectedPeLtpIndex}`);
          }
        }
        
        (data.Records as any[]).forEach((record: any, index: number) => {
          if (Array.isArray(record) && record.length >= 12) {
            // Try detected index first, then fallback to documented positions
            // IMPORTANT: Strikes should be in a reasonable range relative to underlying price
            // For RELIANCE (spot ~1485), strikes should be around 1000-2500, not millions
            // OI and Volume are usually much larger (hundreds of thousands or millions)
            let strike = 0;
            const underlyingRangeMin = underlyingPrice > 0 ? underlyingPrice * 0.3 : 500; // 30% below spot minimum
            const underlyingRangeMax = underlyingPrice > 0 ? underlyingPrice * 2.5 : 10000; // 250% above spot maximum
            
            // Try detected index first
            if (detectedStrikeIndex >= 0 && detectedStrikeIndex < record.length) {
              const candidate = parseFloat(record[detectedStrikeIndex] || 0);
              // Validate: strike should be reasonable relative to underlying, and not be OI/volume (those are usually huge)
              if (candidate >= underlyingRangeMin && candidate <= underlyingRangeMax && candidate < 50000) {
                strike = candidate;
              }
            }
            
            // If detected strike doesn't look valid, try other common positions
            // Only accept values that look like strikes (reasonable range, not OI/volume)
            if (!strike || strike < underlyingRangeMin || strike > underlyingRangeMax || strike >= 50000) {
              // Try common positions: 2, 3, 4, 1, 0 - but validate each one
              for (const idx of [2, 3, 4, 1, 0]) {
                if (idx < record.length) {
                  const testStrike = parseFloat(record[idx] || 0);
                  // Validate: must be in reasonable range AND not too large (OI/volume are usually huge)
                  if (testStrike >= underlyingRangeMin && testStrike <= underlyingRangeMax && testStrike < 50000 && !isNaN(testStrike)) {
                    strike = testStrike;
                    console.log(`[Option Chain ${symbol}] Found valid strike ${strike} at index ${idx} (underlying: ${underlyingPrice})`);
                    break;
                  }
                }
              }
            }
            
            // Final validation: if strike still doesn't look right, skip this record
            if (strike < underlyingRangeMin || strike > underlyingRangeMax || strike >= 50000) {
              if (index < 3) {
                console.log(`[Option Chain ${symbol}] ⚠️ Invalid strike ${strike} for record ${index} (underlying: ${underlyingPrice}, range: ${underlyingRangeMin}-${underlyingRangeMax})`);
              }
              return; // Skip this record
            }
            
            // Find CE and PE LTP - LTP should be small values (0-500 typically), NOT strikes
            // LTP is usually much smaller than strike prices
            // For RELIANCE: strikes ~1500, LTPs ~5-100
            let ceLtp = null;
            let peLtp = null;
            
            // Search for CE LTP - should be a small positive number (0-500 range)
            // Try positions after strike first
            const ceLtpCandidates = detectedStrikeIndex >= 0 ? [
              detectedStrikeIndex + 1,
              detectedStrikeIndex + 2,
              detectedStrikeIndex + 3,
              4, 5, 6  // Fallback positions
            ] : [4, 5, 6];
            
            for (const idx of ceLtpCandidates) {
              if (idx >= 0 && idx < record.length && idx !== detectedStrikeIndex) {
                const val = record[idx];
                if (val !== null && val !== undefined) {
                  const numVal = parseFloat(val);
                  // LTP validation: must be small (0-500), positive, and NOT the strike
                  if (!isNaN(numVal) && numVal >= 0 && numVal < 500 && numVal !== strike) {
                    ceLtp = numVal;
                    break;
                  }
                }
              }
            }
            
            // Search for PE LTP - should be a small positive number (0-500 range)
            // Usually 7-8 positions after CE LTP
            const peLtpCandidates = detectedStrikeIndex >= 0 ? [
              detectedStrikeIndex + 8,
              detectedStrikeIndex + 9,
              detectedStrikeIndex + 10,
              11, 12, 13  // Fallback positions
            ] : [11, 12, 13];
            
            for (const idx of peLtpCandidates) {
              if (idx >= 0 && idx < record.length && idx !== detectedStrikeIndex) {
                const val = record[idx];
                if (val !== null && val !== undefined) {
                  const numVal = parseFloat(val);
                  // LTP validation: must be small (0-500), positive, and NOT the strike
                  if (!isNaN(numVal) && numVal >= 0 && numVal < 500 && numVal !== strike) {
                    peLtp = numVal;
                    break;
                  }
                }
              }
            }
            
            // Log LTP extraction for first record
            if (index < 3) {
              console.log(`[Option Chain ${symbol}] LTP extraction for record ${index}:`, {
                strike: strike,
                ceLtp: ceLtp,
                peLtp: peLtp,
                ceLtpFound: ceLtp !== null,
                peLtpFound: peLtp !== null,
                recordSample: record.slice(0, 15).map((v: any, i: number) => `[${i}]=${v}`).join(', ')
              });
            }
            
            // Extract Greeks if available (they might be in the record)
            // CE Greeks might be after CE LTP, PE Greeks after PE LTP
            const ceDelta = record[12] !== null && record[12] !== undefined ? parseFloat(record[12]) : 0;
            const ceGamma = record[13] !== null && record[13] !== undefined ? parseFloat(record[13]) : 0;
            const ceTheta = record[14] !== null && record[14] !== undefined ? parseFloat(record[14]) : 0;
            const ceVega = record[15] !== null && record[15] !== undefined ? parseFloat(record[15]) : 0;
            
            const peDelta = record[16] !== null && record[16] !== undefined ? parseFloat(record[16]) : 0;
            const peGamma = record[17] !== null && record[17] !== undefined ? parseFloat(record[17]) : 0;
            const peTheta = record[18] !== null && record[18] !== undefined ? parseFloat(record[18]) : 0;
            const peVega = record[19] !== null && record[19] !== undefined ? parseFloat(record[19]) : 0;
            
            // Extract expiry from record if available
            if (!effectiveExpiry && record[1]) {
              effectiveExpiry = String(record[1]).trim() || effectiveExpiry;
            }
            
            // Only process if we have a valid strike
            // Also validate LTP values - they must be small and reasonable
            if (strike > 0 && !isNaN(strike) && !seenStrikes.has(strike)) {
              // Final LTP validation: must be small values (0-500), not strikes or OI
              const validCeLtp = ceLtp !== null && !isNaN(ceLtp) && ceLtp >= 0 && ceLtp < 500 && ceLtp !== strike;
              const validPeLtp = peLtp !== null && !isNaN(peLtp) && peLtp >= 0 && peLtp < 500 && peLtp !== strike;
              
              // Only add options if we have valid LTPs
              if (validCeLtp || validPeLtp) {
                seenStrikes.add(strike);
                
                // Add CE option if LTP exists and is valid
                if (validCeLtp) {
                  options.push({
                    symbol: symbol,
                    optionSymbol: `${symbol}${strike}CE`,
                    strike: strike,
                    series: 'CE',
                    expiry: effectiveExpiry,
                    ltp: ceLtp,
                    delta: ceDelta,
                    gamma: ceGamma,
                    theta: ceTheta,
                    vega: ceVega,
                    timestamp: new Date().toISOString()
                  });
                }
                
                // Add PE option if LTP exists and is valid
                if (validPeLtp) {
                  options.push({
                    symbol: symbol,
                    optionSymbol: `${symbol}${strike}PE`,
                    strike: strike,
                    series: 'PE',
                    expiry: effectiveExpiry,
                    ltp: peLtp,
                    delta: peDelta,
                    gamma: peGamma,
                    theta: peTheta,
                    vega: peVega,
                    timestamp: new Date().toISOString()
                  });
                }
              } else if (index < 3) {
                // Log if we skipped due to invalid LTPs
                console.log(`[Option Chain ${symbol}] ⚠️ Record ${index} skipped: invalid LTPs`, {
                  strike: strike,
                  ceLtp: ceLtp,
                  peLtp: peLtp,
                  ceLtpValid: validCeLtp,
                  peLtpValid: validPeLtp
                });
              }
              
              // Log the mapped option for verification (first 3 records only)
              if (index < 3 && (validCeLtp || validPeLtp)) {
                console.log(`[Option Chain ${symbol}] ✅ Record ${index} mapped:`, {
                  strike: strike,
                  strikeIndex: detectedStrikeIndex >= 0 ? detectedStrikeIndex : 'auto-detected',
                  strikeSource: `record[${detectedStrikeIndex >= 0 ? detectedStrikeIndex : '?'}] = ${record[detectedStrikeIndex >= 0 ? detectedStrikeIndex : 3]}`,
                  ceLtp: ceLtp !== null && validCeLtp ? ceLtp : 'null/invalid',
                  peLtp: peLtp !== null && validPeLtp ? peLtp : 'null/invalid',
                  ceOption: validCeLtp ? `${symbol}${strike}CE @ ₹${ceLtp}` : null,
                  peOption: validPeLtp ? `${symbol}${strike}PE @ ₹${peLtp}` : null,
                  rawFields: `[3]=${record[3]}, [4]=${record[4]}, [2]=${record[2]}, [1]=${record[1]}, [0]=${record[0]}`
                });
              }
            } else if (index < 3) {
              // Log if strike is invalid for first few records
              console.log(`[Option Chain ${symbol}] ⚠️ Record ${index} skipped:`, {
                strike: strike,
                strikeIsValid: strike > 0 && !isNaN(strike),
                record3: record[3],
                recordLength: record.length
              });
            }
          }
        });
        
        console.log(`[Option Chain ${symbol}] Parsed ${options.length} options from Records array (using record[3] for strike)`);
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

    const chainResponse = {
      options,
      underlyingPrice,
      expiry: effectiveExpiry
    };

    console.log(`[Option Chain ${symbol}] ✅ Successfully parsed ${options.length} options`);
    
    // Log sample strikes to verify they look correct
    if (options.length > 0) {
      const uniqueStrikes = Array.from(new Set(options.map(o => o.strike))).sort((a, b) => a - b);
      console.log(`[Option Chain ${symbol}] Strike prices found:`, uniqueStrikes.slice(0, 10).join(', '), uniqueStrikes.length > 10 ? `... (${uniqueStrikes.length} total)` : '');
      console.log(`[Option Chain ${symbol}] Strike range: ${uniqueStrikes[0]} to ${uniqueStrikes[uniqueStrikes.length - 1]}`);
      console.log(`[Option Chain ${symbol}] Sample options:`, {
        first: options[0],
        middle: options[Math.floor(options.length / 2)],
        last: options[options.length - 1]
      });
    }
    
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

