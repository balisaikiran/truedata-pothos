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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState({
    onlySignals: false,
    minIV: 0,
    maxIV: 100,
    sortBy: 'change' as 'change' | 'iv' | 'volume'
  });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
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
      if (optionChains[symbol]) return; // Already fetched

      const response = await apiService.getFNOOptionChain(symbol);
      setOptionChains(prev => ({
        ...prev,
        [symbol]: response.options
      }));
    } catch (err: any) {
      console.error(`Error fetching option chain for ${symbol}:`, err);
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

  const generateOptionStrikes = (stock: FNOStockData, options: OptionData[]) => {
    const strikes = [];
    const baseStrike = Math.round(stock.spot / 100) * 100;
    
    for (let i = -5; i <= 5; i++) {
      const strike = baseStrike + (i * 100);
      const moneyness = ((stock.spot - strike) / stock.spot) * 100;
      
      // Find call and put options for this strike
      const callOption = options.find(opt => opt.strike === strike && opt.series === 'CE');
      const putOption = options.find(opt => opt.strike === strike && opt.series === 'PE');
      
      strikes.push({
        strike,
        callBid: callOption ? callOption.ltp * 0.95 : 0,
        callAsk: callOption ? callOption.ltp * 1.05 : 0,
        callOI: Math.floor(Math.random() * 1000000), // Mock OI data
        putBid: putOption ? putOption.ltp * 0.95 : 0,
        putAsk: putOption ? putOption.ltp * 1.05 : 0,
        putOI: Math.floor(Math.random() * 1000000), // Mock OI data
        moneyness
      });
    }
    
    return strikes;
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
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-right">Spot</th>
              <th className="px-4 py-2 text-right">Change %</th>
              <th className="px-4 py-2 text-right">Volume</th>
              <th className="px-4 py-2 text-right">IV</th>
              <th className="px-4 py-2 text-right">IV Rank</th>
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
                  <td className="px-4 py-2 text-right">{stock.iv}%</td>
                  <td className="px-4 py-2 text-right">{stock.ivRank}</td>
                  <td className="px-4 py-2 text-right">{stock.ivPercentile}</td>
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
                    <td colSpan="9" className="px-4 py-4 bg-gray-850">
                      <div className="mb-2 font-semibold text-gray-300">
                        Option Chain - {stock.symbol} (Spot: {stock.spot.toFixed(2)})
                      </div>
                      {optionChains[stock.symbol] ? (
                        <div className="text-sm text-gray-400">
                          Loading option chain data...
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">
                          No option chain data available
                        </div>
                      )}
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
