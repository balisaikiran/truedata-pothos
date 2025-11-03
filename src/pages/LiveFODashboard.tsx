import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertCircle, TrendingUp, TrendingDown, Activity, Clock, ChevronDown, ChevronUp, Play, Pause, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';
import { FNOStockData, FNOMarketSummary, OptionData } from '../../shared/types';

// Black-Scholes calculation functions
const calculateGreeks = (S: number, K: number, T: number, r: number, sigma: number, optionType: 'call' | 'put' = 'call') => {
  if (T <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

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

  const pdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  const N_d1 = cdf(d1);
  const N_d2 = cdf(d2);
  const n_d1 = pdf(d1);

  let delta: number, gamma: number, theta: number, vega: number, rho: number;

  if (optionType === 'call') {
    delta = N_d1;
    gamma = n_d1 / (S * sigma * Math.sqrt(T));
    theta = -(S * n_d1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * N_d2;
    vega = S * n_d1 * Math.sqrt(T);
    rho = K * T * Math.exp(-r * T) * N_d2;
  } else {
    delta = N_d1 - 1;
    gamma = n_d1 / (S * sigma * Math.sqrt(T));
    theta = -(S * n_d1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * (1 - N_d2);
    vega = S * n_d1 * Math.sqrt(T);
    rho = -K * T * Math.exp(-r * T) * (1 - N_d2);
  }

  return {
    delta: delta.toFixed(4),
    gamma: (gamma * 100).toFixed(4), // Multiply by 100 for percentage
    theta: (theta / 365).toFixed(2), // Daily theta
    vega: (vega / 100).toFixed(2), // Vega per 1% change in IV
    rho: (rho / 100).toFixed(2) // Rho per 1% change in interest rate
  };
};

const LiveFODashboard = () => {
  const [stocks, setStocks] = useState<FNOStockData[]>([]);
  const [marketSummary, setMarketSummary] = useState<FNOMarketSummary | null>(null);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [expandedChains, setExpandedChains] = useState<Record<string, boolean>>({});
  const [optionChains, setOptionChains] = useState<Record<string, OptionData[]>>({});
  const [loadingChains, setLoadingChains] = useState<Record<string, boolean>>({});
  const [underlyingPrices, setUnderlyingPrices] = useState<Record<string, number>>({}); // Store underlying prices from option chain API
  const [selectedSymbolForChain, setSelectedSymbolForChain] = useState<string>('');
  const [standaloneChain, setStandaloneChain] = useState<{
    symbol: string;
    spot: number;
    options: OptionData[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState({
    onlySignals: false,
    minIV: 0,
    maxIV: 100,
    sortBy: 'change' as 'change' | 'iv' | 'volume' | 'symbol' | 'spot'
  });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch market data
  const fetchMarketData = async () => {
    try {
      setError(null);
      setLoading(true);
      console.log('Fetching F&O market data...');
      
      const [marketDataResponse, summaryResponse] = await Promise.all([
        apiService.getFNOMarketData(),
        apiService.getFNOMarketSummary()
      ]);

      console.log('Market data response:', marketDataResponse);
      console.log('Summary response:', summaryResponse);

      if (marketDataResponse && marketDataResponse.stocks) {
        if (marketDataResponse.stocks.length > 0) {
          setStocks(marketDataResponse.stocks);
          if (summaryResponse && summaryResponse.summary) {
            setMarketSummary(summaryResponse.summary);
          }
          setLastUpdate(new Date());
          setError(null); // Clear any previous errors
        } else {
          console.warn('No stocks data returned from API - empty array');
          setError('No market data available at the moment. The market might be closed or data is temporarily unavailable.');
          setStocks([]);
        }
      } else {
        console.warn('Invalid response structure from API');
        setError('Invalid response from server. Please try again later.');
        setStocks([]);
      }
    } catch (err: any) {
      console.error('Error fetching market data:', err);
      console.error('Error details:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        isAuthError: err.isAuthError
      });
      
      if (err.isAuthError || err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
        // Don't redirect immediately, let user see the error
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else if (err.response?.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
        // Retry after 5 seconds
        setTimeout(() => {
          fetchMarketData();
        }, 5000);
      } else {
        setError(err.message || 'Failed to fetch market data. Please check console for details.');
      }
      setStocks([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch option chain for a specific stock
  const fetchOptionChain = async (symbol: string) => {
    try {
      setLoadingChains(prev => ({ ...prev, [symbol]: true }));
      console.log(`Fetching option chain for ${symbol}...`);
      
      // Always fetch to get latest data
      const response = await apiService.getFNOOptionChain(symbol);
      console.log(`Option chain response for ${symbol}:`, response);
      console.log(`Options count: ${response.options?.length || 0}`);
      console.log(`Response structure:`, {
        hasOptions: !!response.options,
        optionsType: Array.isArray(response.options) ? 'array' : typeof response.options,
        optionsLength: Array.isArray(response.options) ? response.options.length : 'N/A',
        underlyingPrice: response.underlyingPrice,
        expiry: response.expiry
      });
      
      // Ensure we have an array
      const optionsArray = Array.isArray(response.options) ? response.options : [];
      
      if (optionsArray.length > 0) {
        console.log(`Sample option:`, {
          symbol: optionsArray[0].symbol,
          strike: optionsArray[0].strike,
          series: optionsArray[0].series,
          ltp: optionsArray[0].ltp
        });
        
        // Log strike range
        const strikes = Array.from(new Set(optionsArray.map(o => o.strike))).sort((a, b) => a - b);
        console.log(`Strike range: ${strikes[0]} to ${strikes[strikes.length - 1]}`);
        console.log(`Underlying price from API: ${response.underlyingPrice}`);
      }
      
      setOptionChains(prev => ({
        ...prev,
        [symbol]: optionsArray
      }));
      
      // Store underlying price from API response for accurate strike calculations
      if (response.underlyingPrice && response.underlyingPrice > 0) {
        setUnderlyingPrices(prev => ({
          ...prev,
          [symbol]: response.underlyingPrice
        }));
        console.log(`[${symbol}] Stored underlying price from option chain: ${response.underlyingPrice} (vs stock spot: ${stocks.find(s => s.symbol === symbol)?.spot || 'N/A'})`);
      }
      
      setLoadingChains(prev => ({ ...prev, [symbol]: false }));
    } catch (err: any) {
      console.error(`Error fetching option chain for ${symbol}:`, err);
      console.error(`Error details:`, {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        url: err.config?.url
      });
      setOptionChains(prev => ({
        ...prev,
        [symbol]: []
      }));
      setLoadingChains(prev => ({ ...prev, [symbol]: false }));
    }
  };

  useEffect(() => {
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Initial fetch
    fetchMarketData();
    
    // Set up auto-refresh if enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchMarketData();
      }, 30000); // Update every 30 seconds
    }
    
    // Cleanup on unmount or when autoRefresh changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  // Manual refresh function
  const handleManualRefresh = () => {
    fetchMarketData();
  };

  const filteredStocks = useMemo(() => {
    let filtered = [...stocks];

    if (filterOptions.onlySignals) {
      filtered = filtered.filter(s => s.gammaSignal);
    }

    filtered = filtered.filter(s => 
      s.iv >= filterOptions.minIV && s.iv <= filterOptions.maxIV
    );

    if (filterOptions.sortBy === 'change') {
      filtered.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    } else if (filterOptions.sortBy === 'iv') {
      filtered.sort((a, b) => b.iv - a.iv);
    } else if (filterOptions.sortBy === 'volume') {
      filtered.sort((a, b) => b.volume - a.volume);
    } else if (filterOptions.sortBy === 'symbol') {
      filtered.sort((a, b) => a.symbol.localeCompare(b.symbol));
    } else if (filterOptions.sortBy === 'spot') {
      filtered.sort((a, b) => b.spot - a.spot);
    }

    return filtered;
  }, [stocks, filterOptions]);

  const toggleChainExpansion = async (symbol: string) => {
    const isExpanding = !expandedChains[symbol];
    setExpandedChains(prev => ({
      ...prev,
      [symbol]: isExpanding
    }));

    if (isExpanding) {
      await fetchOptionChain(symbol);
    }
  };

  // Fetch standalone option chain for selected symbol from dropdown
  const fetchStandaloneOptionChain = async (symbol: string) => {
    if (!symbol) {
      setStandaloneChain(null);
      return;
    }
    
    try {
      console.log(`Fetching standalone option chain for ${symbol}...`);
      const response = await apiService.getFNOOptionChain(symbol);
      console.log(`Standalone option chain response for ${symbol}:`, response);
      
      // Get spot price from stocks list or fetch separately
      const stockData = stocks.find(s => s.symbol === symbol);
      const spotPrice = stockData?.spot || response.underlyingPrice || 0;
      
      setStandaloneChain({
        symbol,
        spot: spotPrice,
        options: response.options || []
      });
    } catch (err: any) {
      console.error(`Error fetching standalone option chain for ${symbol}:`, err);
      console.error(`Error details:`, {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        url: err.config?.url
      });
      setStandaloneChain(null);
    }
  };

  // Filter option strikes to show +5%, +10%, +15%, +20% bands from spot
  const getFilteredStrikes = (spot: number, options: OptionData[]) => {
    if (!options || options.length === 0) {
      console.warn('getFilteredStrikes: No options provided');
      return [];
    }
    
    console.log(`getFilteredStrikes called with spot: ${spot}, options count: ${options.length}`);
    console.log(`Sample strikes:`, options.slice(0, 5).map(o => o.strike));
    
    const targetPercentages = [5, 10, 15, 20]; // +5%, +10%, +15%, +20%
    const strikes: Array<{
      strike: number;
      percentage: number;
      callOption?: OptionData;
      putOption?: OptionData;
    }> = [];

    // Calculate target strike prices
    targetPercentages.forEach(percent => {
      const targetStrike = Math.round(spot * (1 + percent / 100));
      
      // Find closest available strikes (more flexible tolerance - up to 5% away)
      const tolerance = spot * 0.05; // Increased from 2% to 5%
      
      // Find the closest matching strikes
      const allMatchingCalls = options.filter(opt => 
        opt.series === 'CE' && 
        Math.abs(opt.strike - targetStrike) <= tolerance
      );
      
      const allMatchingPuts = options.filter(opt => 
        opt.series === 'PE' && 
        Math.abs(opt.strike - targetStrike) <= tolerance
      );
      
      // Get the closest one to target
      const callOption = allMatchingCalls.length > 0
        ? allMatchingCalls.reduce((closest, opt) => 
            Math.abs(opt.strike - targetStrike) < Math.abs(closest.strike - targetStrike) ? opt : closest
          )
        : undefined;
      
      const putOption = allMatchingPuts.length > 0
        ? allMatchingPuts.reduce((closest, opt) => 
            Math.abs(opt.strike - targetStrike) < Math.abs(closest.strike - targetStrike) ? opt : closest
          )
        : undefined;

      // Use the strike from whichever option we found (prefer call if both exist)
      const strike = callOption?.strike || putOption?.strike || targetStrike;
      
      if (callOption || putOption) {
        strikes.push({
          strike,
          percentage: percent,
          callOption,
          putOption
        });
      } else {
        console.log(`No option found for ${percent}% target (${targetStrike}) within tolerance`);
      }
    });

    // Also add ATM (At The Money) strike if available
    // Find the closest strike to spot price
    const allStrikes = Array.from(new Set(options.map(o => o.strike))).sort((a, b) => a - b);
    const closestToSpot = allStrikes.reduce((closest, strike) => 
      Math.abs(strike - spot) < Math.abs(closest - spot) ? strike : closest
    );
    
    const atmCall = options.find(opt => opt.strike === closestToSpot && opt.series === 'CE');
    const atmPut = options.find(opt => opt.strike === closestToSpot && opt.series === 'PE');
    
    if ((atmCall || atmPut) && !strikes.find(s => s.strike === closestToSpot)) {
      strikes.unshift({
        strike: closestToSpot,
        percentage: 0,
        callOption: atmCall,
        putOption: atmPut
      });
    }

    console.log(`getFilteredStrikes returning ${strikes.length} strikes:`, strikes.map(s => ({ strike: s.strike, percent: s.percentage })));
    
    return strikes.sort((a, b) => a.strike - b.strike);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
          <p>Loading F&O Market Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-400" />
          <p className="text-red-400 mb-4">{error}</p>
          <button 
            onClick={fetchMarketData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
      {/* Header */}
      <div className="mb-6 border-b border-gray-700 pb-4">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-blue-400">Live F&O Dashboard</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">
              <Clock className="inline w-4 h-4 mr-1" />
              Last Update: {lastUpdate.toLocaleTimeString()}
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 rounded-md flex items-center gap-2 text-sm transition-colors"
              title="Manual Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-md flex items-center gap-2 text-sm transition-colors ${
                autoRefresh 
                  ? 'bg-green-700 hover:bg-green-600 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              title={autoRefresh ? 'Pause Auto Refresh' : 'Resume Auto Refresh'}
            >
              {autoRefresh ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Resume
                </>
              )}
            </button>
            <div className={`flex items-center gap-2 text-xs ${autoRefresh ? 'text-green-400' : 'text-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
              <span>{autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Market Summary */}
      {marketSummary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-sm text-gray-400 mb-2">Active Signals</h3>
            <div className="text-2xl font-bold text-yellow-400">
              {marketSummary.activeSignals}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-sm text-gray-400 mb-2">Avg IV</h3>
            <div className="text-2xl font-bold text-blue-400">
              {marketSummary.avgIV}%
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-sm text-gray-400 mb-2">Top Gainer</h3>
            <div className="text-2xl font-bold text-green-400">
              {marketSummary.topGainer}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-sm text-gray-400 mb-2">Top Loser</h3>
            <div className="text-2xl font-bold text-red-400">
              {marketSummary.topLoser}
            </div>
          </div>
        </div>
      )}

      {/* Symbol Selector for Option Chain */}
      <div className="bg-gray-800 p-4 rounded-lg mb-6">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-gray-300 font-semibold">View Option Chain:</label>
            <select
              value={selectedSymbolForChain}
              onChange={(e) => {
                setSelectedSymbolForChain(e.target.value);
                fetchStandaloneOptionChain(e.target.value);
              }}
              className="px-3 py-2 bg-gray-700 text-gray-200 rounded border border-gray-600 focus:outline-none focus:border-blue-500 min-w-[150px]"
            >
              <option value="">Select Symbol</option>
              {stocks.map(stock => (
                <option key={stock.symbol} value={stock.symbol}>
                  {stock.symbol} (₹{stock.spot.toFixed(2)})
                </option>
              ))}
            </select>
            {selectedSymbolForChain && (
              <button
                onClick={() => fetchStandaloneOptionChain(selectedSymbolForChain)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Standalone Option Chain Display */}
      {standaloneChain && (
        <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-300">
              Option Chain - {standaloneChain.symbol} (Spot: ₹{standaloneChain.spot.toFixed(2)})
            </h2>
            <button
              onClick={() => setStandaloneChain(null)}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
            >
              Close
            </button>
          </div>
          <div className="p-4">
            {standaloneChain.options.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-300">Strike</th>
                      <th className="px-3 py-2 text-left text-gray-300">% from Spot</th>
                      <th className="px-3 py-2 text-center text-gray-300" colSpan={2}>CALL (CE)</th>
                      <th className="px-3 py-2 text-center text-gray-300" colSpan={2}>PUT (PE)</th>
                    </tr>
                    <tr>
                      <th></th>
                      <th></th>
                      <th className="px-2 py-1 text-center text-blue-400 text-xs">LTP</th>
                      <th className="px-2 py-1 text-center text-blue-400 text-xs">Delta</th>
                      <th className="px-2 py-1 text-center text-red-400 text-xs">LTP</th>
                      <th className="px-2 py-1 text-center text-red-400 text-xs">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredStrikes(standaloneChain.spot, standaloneChain.options).map((strikeData) => {
                      const actualPercent = ((strikeData.strike - standaloneChain.spot) / standaloneChain.spot) * 100;
                      return (
                        <tr key={strikeData.strike} className="border-t border-gray-700 hover:bg-gray-750">
                          <td className="px-3 py-2 font-semibold text-gray-300">
                            ₹{strikeData.strike}
                          </td>
                          <td className={`px-3 py-2 ${
                            Math.abs(actualPercent) < 0.5 ? 'text-yellow-400' : 
                            actualPercent > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {actualPercent >= 0 ? '+' : ''}{actualPercent.toFixed(1)}%
                          </td>
                          <td className="px-2 py-2 text-center text-blue-400">
                            {strikeData.callOption ? `₹${strikeData.callOption.ltp.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-400 text-xs">
                            {strikeData.callOption ? parseFloat(strikeData.callOption.delta.toString()).toFixed(3) : '-'}
                          </td>
                          <td className="px-2 py-2 text-center text-red-400">
                            {strikeData.putOption ? `₹${strikeData.putOption.ltp.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-400 text-xs">
                            {strikeData.putOption ? parseFloat(strikeData.putOption.delta.toString()).toFixed(3) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                    {getFilteredStrikes(standaloneChain.spot, standaloneChain.options).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                          No option chain data available for strikes at +5%, +10%, +15%, +20% bands.
                          <br />
                          <span className="text-xs">Total options available: {standaloneChain.options.length}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="mt-3 text-xs text-gray-500">
                  Showing strikes at: ATM, +5%, +10%, +15%, +20% from spot price (₹{standaloneChain.spot.toFixed(2)})
                  <br />
                  Total options available: {standaloneChain.options.length}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 flex items-center gap-2">
                <Activity className="w-4 h-4 animate-spin" />
                Loading option chain data...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 p-4 rounded-lg mb-6">
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterOptions.onlySignals}
              onChange={(e) => setFilterOptions({...filterOptions, onlySignals: e.target.checked})}
              className="rounded bg-gray-700"
            />
            <span>Show Only Signals</span>
          </label>
          
          <div className="flex items-center gap-2">
            <span>IV Range:</span>
            <input
              type="number"
              value={filterOptions.minIV}
              onChange={(e) => setFilterOptions({...filterOptions, minIV: parseInt(e.target.value)})}
              className="w-16 px-2 py-1 bg-gray-700 rounded"
            />
            <span>-</span>
            <input
              type="number"
              value={filterOptions.maxIV}
              onChange={(e) => setFilterOptions({...filterOptions, maxIV: parseInt(e.target.value)})}
              className="w-16 px-2 py-1 bg-gray-700 rounded"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span>Sort By:</span>
            <select
              value={filterOptions.sortBy}
              onChange={(e) => setFilterOptions({...filterOptions, sortBy: e.target.value as any})}
              className="px-2 py-1 bg-gray-700 rounded"
            >
              <option value="change">Change %</option>
              <option value="iv">IV</option>
              <option value="volume">Volume</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stocks Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-2 text-left cursor-pointer hover:bg-gray-600" onClick={() => setFilterOptions({...filterOptions, sortBy: 'symbol'})}>
                Symbol {filterOptions.sortBy === 'symbol' && '▼'}
              </th>
              <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-600" onClick={() => setFilterOptions({...filterOptions, sortBy: 'spot'})}>
                Spot {filterOptions.sortBy === 'spot' && '▼'}
              </th>
              <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-600" onClick={() => setFilterOptions({...filterOptions, sortBy: 'change'})}>
                Change % {filterOptions.sortBy === 'change' && '▼'}
              </th>
              <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-600" onClick={() => setFilterOptions({...filterOptions, sortBy: 'volume'})}>
                Volume {filterOptions.sortBy === 'volume' && '▼'}
              </th>
              <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-600" onClick={() => setFilterOptions({...filterOptions, sortBy: 'iv'})}>
                IV {filterOptions.sortBy === 'iv' && '▼'}
              </th>
              <th className="px-4 py-2 text-right">IV %ile</th>
              <th className="px-4 py-2 text-center">Signal</th>
              <th className="px-4 py-2 text-center">Chain</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.map((stock) => (
              <React.Fragment key={stock.symbol}>
                <tr className="border-t border-gray-700 hover:bg-gray-750">
                  <td className="px-4 py-2 font-semibold text-blue-400">{stock.symbol}</td>
                  <td className="px-4 py-2 text-right">{stock.spot.toFixed(2)}</td>
                  <td className={`px-4 py-2 text-right ${stock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stock.change >= 0 ? <TrendingUp className="inline w-4 h-4 mr-1" /> : 
                     <TrendingDown className="inline w-4 h-4 mr-1" />}
                    {stock.changePercent}%
                  </td>
                  <td className="px-4 py-2 text-right">{(stock.volume / 1000000).toFixed(2)}M</td>
                  <td className="px-4 py-2 text-right">
                    {stock.iv > 0 ? `${stock.iv.toFixed(1)}%` : <span className="text-gray-500">N/A</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {stock.ivPercentile > 0 ? `${stock.ivPercentile.toFixed(0)}%` : <span className="text-gray-500">N/A</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {stock.gammaSignal && 
                      <AlertCircle className="inline w-5 h-5 text-yellow-400" />
                    }
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => toggleChainExpansion(stock.symbol)}
                      className="p-1 hover:bg-gray-600 rounded"
                    >
                      {expandedChains[stock.symbol] ? 
                        <ChevronUp className="w-4 h-4" /> : 
                        <ChevronDown className="w-4 h-4" />
                      }
                    </button>
                  </td>
                </tr>
                
                {/* Expanded Option Chain */}
                {expandedChains[stock.symbol] && (
                  <tr>
                    <td colSpan="9" className="px-4 py-4 bg-gray-900">
                      <div className="mb-3 font-semibold text-gray-300 flex items-center justify-between">
                        <span>Option Chain - {stock.symbol} (Spot: ₹{stock.spot.toFixed(2)})</span>
                        <button
                          onClick={() => fetchOptionChain(stock.symbol)}
                          className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                        >
                          Refresh Chain
                        </button>
                      </div>
                      
                      {loadingChains[stock.symbol] ? (
                        <div className="text-sm text-gray-400 flex items-center gap-2">
                          <Activity className="w-4 h-4 animate-spin" />
                          Loading option chain data...
                        </div>
                      ) : (() => {
                        const hasData = optionChains[stock.symbol] && optionChains[stock.symbol].length > 0;
                        
                        // Use underlying price from option chain API response if available (more accurate)
                        // Otherwise fall back to stock spot price
                        const underlyingPrice = underlyingPrices[stock.symbol] || stock.spot;
                        
                        console.log(`[${stock.symbol} Render] Using price: ${underlyingPrice} (from API: ${underlyingPrices[stock.symbol] || 'N/A'}, stock spot: ${stock.spot})`);
                        
                        // Group all options by strike price (show ALL strikes, not just filtered)
                        const allStrikesMap = new Map<number, { callOption?: OptionData; putOption?: OptionData }>();
                        
                        if (hasData) {
                          optionChains[stock.symbol].forEach(option => {
                            if (!allStrikesMap.has(option.strike)) {
                              allStrikesMap.set(option.strike, {});
                            }
                            const strikeData = allStrikesMap.get(option.strike)!;
                            if (option.series === 'CE') {
                              strikeData.callOption = option;
                            } else if (option.series === 'PE') {
                              strikeData.putOption = option;
                            }
                          });
                        }
                        
                        // Convert to array and sort by strike
                        const allStrikes = Array.from(allStrikesMap.entries())
                          .map(([strike, options]) => ({
                            strike,
                            percentage: ((strike - underlyingPrice) / underlyingPrice) * 100,
                            callOption: options.callOption,
                            putOption: options.putOption
                          }))
                          .sort((a, b) => a.strike - b.strike);
                        
                        console.log(`[UI Render ${stock.symbol}]`, {
                          hasData,
                          optionsCount: optionChains[stock.symbol]?.length || 0,
                          spot: underlyingPrice,
                          allStrikesCount: allStrikes.length,
                          isLoading: loadingChains[stock.symbol]
                        });
                        
                        // Show all strikes if we have data
                        if (hasData && allStrikes.length > 0) {
                          return (
                          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-800 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left text-gray-400">Strike</th>
                                <th className="px-3 py-2 text-left text-gray-400">% from Spot</th>
                                <th className="px-3 py-2 text-center text-gray-400" colSpan={2}>CALL (CE)</th>
                                <th className="px-3 py-2 text-center text-gray-400" colSpan={2}>PUT (PE)</th>
                              </tr>
                              <tr>
                                <th></th>
                                <th></th>
                                <th className="px-2 py-1 text-center text-blue-400 text-xs">LTP</th>
                                <th className="px-2 py-1 text-center text-blue-400 text-xs">Delta</th>
                                <th className="px-2 py-1 text-center text-red-400 text-xs">LTP</th>
                                <th className="px-2 py-1 text-center text-red-400 text-xs">Delta</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allStrikes.map((strikeData) => {
                                const actualPercent = ((strikeData.strike - underlyingPrice) / underlyingPrice) * 100;
                                return (
                                  <tr key={strikeData.strike} className="border-t border-gray-700 hover:bg-gray-800">
                                    <td className="px-3 py-2 font-semibold text-gray-300">
                                      ₹{strikeData.strike}
                                    </td>
                                    <td className={`px-3 py-2 ${
                                      Math.abs(actualPercent) < 0.5 ? 'text-yellow-400' : 
                                      actualPercent > 0 ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                      {actualPercent >= 0 ? '+' : ''}{actualPercent.toFixed(1)}%
                                    </td>
                                    <td className="px-2 py-2 text-center text-blue-400">
                                      {strikeData.callOption ? `₹${strikeData.callOption.ltp.toFixed(2)}` : '-'}
                                    </td>
                                    <td className="px-2 py-2 text-center text-gray-400 text-xs">
                                      {strikeData.callOption ? parseFloat(strikeData.callOption.delta.toString()).toFixed(3) : '-'}
                                    </td>
                                    <td className="px-2 py-2 text-center text-red-400">
                                      {strikeData.putOption ? `₹${strikeData.putOption.ltp.toFixed(2)}` : '-'}
                                    </td>
                                    <td className="px-2 py-2 text-center text-gray-400 text-xs">
                                      {strikeData.putOption ? parseFloat(strikeData.putOption.delta.toString()).toFixed(3) : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          
                          {/* Show available strikes info */}
                          <div className="mt-3 text-xs text-gray-500 bg-gray-800 p-2 rounded">
                            Showing ALL {allStrikes.length} strikes from spot price ₹{underlyingPrice.toFixed(2)}
                            <br />
                            Total options: {optionChains[stock.symbol].length} (CE: {optionChains[stock.symbol].filter(o => o.series === 'CE').length}, PE: {optionChains[stock.symbol].filter(o => o.series === 'PE').length})
                          </div>
                        </div>
                        );
                        }
                        
                        // If no data
                        return hasData ? (
                        <div className="text-sm text-gray-400 p-3 bg-gray-800 rounded">
                          <div className="mb-2 text-green-400">✅ Received {optionChains[stock.symbol].length} options from API</div>
                          <div className="mb-2 text-yellow-400">⚠️ No strikes match +5%, +10%, +15%, +20% for spot ₹{stock.spot.toFixed(2)}</div>
                          <div className="text-xs text-gray-500 mb-2">
                            Available strikes: {Array.from(new Set(optionChains[stock.symbol].map(o => o.strike))).sort((a,b) => a-b).slice(0, 20).join(', ')}
                            {Array.from(new Set(optionChains[stock.symbol].map(o => o.strike))).length > 20 && '...'}
                          </div>
                          <div className="text-xs text-blue-400">
                            💡 Use the dropdown selector above to view all available strikes
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">
                          {optionChains[stock.symbol] && optionChains[stock.symbol].length === 0
                            ? 'No option chain data available. Please check if the symbol has active options.'
                            : 'No data available. Click "Refresh Chain" to try again.'}
                        </div>
                      )}
                      )()}  {/* Close the IIFE */}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-800 rounded-lg">
        <h3 className="font-semibold mb-2">Legend & Notes</h3>
        <div className="grid grid-cols-3 gap-4 text-sm text-gray-400">
            <div>
              <AlertCircle className="inline w-4 h-4 text-yellow-400 mr-1" />
              Gamma Signal: &gt;1.5% move (NIFTY) or &gt;2% (others)
            </div>
          <div>
            <span className="text-blue-400">Delta:</span> Rate of change of option price
          </div>
          <div>
            <span className="text-yellow-400">Gamma:</span> Rate of change of delta
          </div>
          <div>
            <span className="text-red-400">Theta:</span> Time decay (daily)
          </div>
          <div>
            IV Rank: Current IV vs 52-week range
          </div>
          <div>
            IV %ile: % of days with lower IV (52 weeks)
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveFODashboard;
