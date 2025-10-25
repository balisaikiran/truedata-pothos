import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Calendar, Target, Filter, Search } from 'lucide-react';
import { format, addDays } from 'date-fns';
import type { OptionData, OptionsChainResponse, Symbol } from '../../shared/types';
import { useTheme } from '../contexts/ThemeContext';
// Remove direct axios; use backend service
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface OptionsChainProps {
  selectedSymbol?: string;
}

interface GroupedOptions {
  strike: number;
  ce?: OptionData;
  pe?: OptionData;
}

const OptionsChain: React.FC<OptionsChainProps> = ({ selectedSymbol = 'NIFTY' }) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [optionsData, setOptionsData] = useState<OptionsChainResponse | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState<string>(selectedSymbol);
  const [symbolQuery, setSymbolQuery] = useState<string>(selectedSymbol);
  const [segment, setSegment] = useState<'EQ' | 'FO' | 'MCX'>('FO');
  const [symbolSuggestions, setSymbolSuggestions] = useState<Symbol[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Generate common expiry dates (weekly and monthly)
  const generateExpiryDates = () => {
    const dates = [];
    const today = new Date();
    
    // Add next 4 weekly expiries (Thursdays)
    for (let i = 0; i < 4; i++) {
      const nextThursday = new Date(today);
      const daysUntilThursday = (4 - today.getDay() + 7) % 7 || 7;
      nextThursday.setDate(today.getDate() + daysUntilThursday + (i * 7));
      dates.push(format(nextThursday, 'yyyy-MM-dd'));
    }
    
    return dates;
  };

  const expiryDates = generateExpiryDates();

  const formatExpiryForAnalytics = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return format(d, 'dd-MM-yyyy');
    } catch {
      return dateStr; // fallback
    }
  };

  // Symbol search (debounced)
  useEffect(() => {
    if (symbolQuery && symbolQuery.length >= 2) {
      setIsSearching(true);
      const timer = setTimeout(async () => {
        try {
          const res = await apiService.searchSymbols(symbolQuery, segment.toLowerCase(), 10);
          setSymbolSuggestions(res.symbols || []);
          setShowSuggestions(true);
        } catch (e) {
          // ignore
        } finally {
          setIsSearching(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSymbolSuggestions([]);
      setShowSuggestions(false);
    }
  }, [symbolQuery, segment]);

  const fetchOptionsChain = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Use backend proxy; do not rely on frontend trueDataToken
      const expiryParam = selectedExpiry || '';
      const data = await apiService.getOptionsChain(currentSymbol, expiryParam);

      // Basic validation
      if (!data || !data.options) {
        throw new Error('Empty options chain from server');
      }

      setOptionsData(data);
      setLastUpdate(new Date());
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.Message ||
        err?.message ||
        'Failed to fetch options chain';
      setError(message);
      setOptionsData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedExpiry && expiryDates.length > 0) {
      setSelectedExpiry(expiryDates[0]);
    }
  }, []);

  useEffect(() => {
    if (selectedExpiry) {
      fetchOptionsChain();
    }
  }, [currentSymbol, selectedExpiry]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (autoRefresh) {
      interval = setInterval(fetchOptionsChain, 10000); // Refresh every 10 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, currentSymbol, selectedExpiry]);

  // Group options by strike price
  const groupOptionsByStrike = (): GroupedOptions[] => {
    if (!optionsData?.options) return [];
    
    const grouped = new Map<number, GroupedOptions>();
    
    optionsData.options.forEach(option => {
      const strike = option.strike;
      if (!grouped.has(strike)) {
        grouped.set(strike, { strike });
      }
      
      const group = grouped.get(strike)!;
      if (option.series === 'CE') {
        group.ce = option;
      } else if (option.series === 'PE') {
        group.pe = option;
      }
    });
    
    return Array.from(grouped.values()).sort((a, b) => a.strike - b.strike);
  };

  const groupedOptions = groupOptionsByStrike();
  const underlyingPrice = optionsData?.underlyingPrice || 0;

  // Find ATM strike
  const atmStrike = groupedOptions.reduce((closest, option) => {
    return Math.abs(option.strike - underlyingPrice) < Math.abs(closest.strike - underlyingPrice)
      ? option
      : closest;
  }, groupedOptions[0] || { strike: 0 });

  const formatGreek = (value: number, decimals: number = 4) => {
    return value.toFixed(decimals);
  };

  const getPriceChangeColor = (current: number, previous: number) => {
    if (current > previous) return 'text-green-400';
    if (current < previous) return 'text-red-400';
    return 'text-gray-300';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Options Chain</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Live options data for {currentSymbol}
            {underlyingPrice > 0 && (
              <span className="ml-2">• Underlying: ₹{underlyingPrice.toFixed(2)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="autoRefresh" className="text-sm text-gray-700 dark:text-gray-300">
              Auto Refresh
            </label>
          </div>
          <button
            onClick={fetchOptionsChain}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md font-medium transition-colors duration-200 flex items-center"
          >
            <RefreshCw className={`${isLoading ? 'animate-spin' : ''} h-4 w-4 mr-2`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Search className="h-4 w-4 inline mr-1" />
              Symbol
            </label>
            <div className="relative">
              <input
                type="text"
                value={symbolQuery}
                onChange={(e) => setSymbolQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type to search (e.g., NIFTY, RELIANCE)"
              />
              {showSuggestions && (symbolSuggestions.length > 0 || isSearching) && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                  {isSearching ? (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-300">Searching...</div>
                  ) : (
                    symbolSuggestions.map((s) => (
                      <button
                        key={s.symbol}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCurrentSymbol(s.symbol);
                          setSymbolQuery(s.symbol);
                          setShowSuggestions(false);
                          setError(null);
                          setOptionsData(null);
                          fetchOptionsChain();
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm"
                      >
                        <span className="font-medium">{s.symbol}</span>
                        <span className="ml-2 text-gray-500 dark:text-gray-400">{s.companyName}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 mt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Segment
              </label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value as 'EQ' | 'FO' | 'MCX')}
                className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="FO">FO</option>
                <option value="EQ">EQ</option>
                <option value="MCX">MCX</option>
              </select>
            </div>

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
              <Calendar className="h-4 w-4 inline mr-1" />
              Expiry Date
            </label>
            <select
              value={selectedExpiry}
              onChange={(e) => setSelectedExpiry(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {expiryDates.map(date => (
                <option key={date} value={date}>
                  {format(new Date(date), 'dd MMM yyyy')}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Last Updated: {format(lastUpdate, 'HH:mm:ss')}</p>
              <p>Total Options: {optionsData?.options?.length || 0}</p>
            </div>
          </div>
          
          <div className="flex items-end justify-end">
            <div className={`flex items-center space-x-2 px-3 py-2 rounded-md ${
              error ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'
            }`}>
              <div className={`h-2 w-2 rounded-full ${
                error ? 'bg-red-500' : autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-green-500'
              }`}></div>
              <span className="text-sm">
                {error ? 'Error' : autoRefresh ? 'Live' : 'Connected'}
              </span>
            </div>
          </div>
        </div>
      </div
      >

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg">
          <p className="font-medium">Error loading options data</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Options Chain Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                {/* Call Options Headers */}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  OI
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  LTP
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Delta
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Gamma
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Theta
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Vega
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-900 dark:text-gray-300 uppercase tracking-wider bg-gray-200 dark:bg-gray-600">
                  <Target className="h-4 w-4 inline mr-1" />
                  Strike
                </th>
                {/* Put Options Headers */}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Vega
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Theta
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Gamma
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Delta
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  LTP
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  OI
                </th>
              </tr>
              <tr className="bg-gray-200 dark:bg-gray-600">
                <th colSpan={6} className="px-4 py-2 text-center text-sm font-medium text-green-600 dark:text-green-300">
                  CALL OPTIONS
                </th>
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">
                  STRIKE
                </th>
                <th colSpan={6} className="px-4 py-2 text-center text-sm font-medium text-red-600 dark:text-red-300">
                  PUT OPTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center space-y-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                  </td>
                </tr>
              ) : groupedOptions.length > 0 ? (
                groupedOptions.map((option) => {
                  const isATM = option.strike === atmStrike?.strike;
                  const isITM_CE = underlyingPrice > option.strike;
                  const isITM_PE = underlyingPrice < option.strike;
                  
                  return (
                    <tr 
                      key={option.strike} 
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ${
                        isATM ? 'bg-yellow-50 dark:bg-gray-750 border-l-4 border-l-yellow-500' : ''
                      }`}
                    >
                      {/* Call Options Data */}
                      <td className={`px-4 py-3 text-sm ${isITM_CE ? 'bg-green-100 dark:bg-green-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.ce ? '0' : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${isITM_CE ? 'bg-green-100 dark:bg-green-900/20' : ''}`}>
                        <span className={option.ce ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}>
                          {option.ce ? `₹${option.ce.ltp.toFixed(2)}` : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm ${isITM_CE ? 'bg-green-100 dark:bg-green-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.ce ? formatGreek(option.ce.delta) : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm ${isITM_CE ? 'bg-green-100 dark:bg-green-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.ce ? formatGreek(option.ce.gamma) : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm ${isITM_CE ? 'bg-green-100 dark:bg-green-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.ce ? formatGreek(option.ce.theta) : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm ${isITM_CE ? 'bg-green-100 dark:bg-green-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.ce ? formatGreek(option.ce.vega) : '-'}
                        </span>
                      </td>
                      
                      {/* Strike Price */}
                      <td className={`px-4 py-3 text-center text-sm font-bold bg-gray-200 dark:bg-gray-600 ${
                        isATM ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'
                      }`}>
                        {option.strike}
                        {isATM && (
                          <div className="text-xs text-yellow-500 dark:text-yellow-300 mt-1">ATM</div>
                        )}
                      </td>
                      
                      {/* Put Options Data */}
                      <td className={`px-4 py-3 text-sm text-right ${isITM_PE ? 'bg-red-100 dark:bg-red-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.pe ? formatGreek(option.pe.vega) : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm text-right ${isITM_PE ? 'bg-red-100 dark:bg-red-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.pe ? formatGreek(option.pe.theta) : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm text-right ${isITM_PE ? 'bg-red-100 dark:bg-red-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.pe ? formatGreek(option.pe.gamma) : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm text-right ${isITM_PE ? 'bg-red-100 dark:bg-red-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.pe ? formatGreek(option.pe.delta) : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right ${isITM_PE ? 'bg-red-100 dark:bg-red-900/20' : ''}`}>
                        <span className={option.pe ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-500'}>
                          {option.pe ? `₹${option.pe.ltp.toFixed(2)}` : '-'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm text-right ${isITM_PE ? 'bg-red-100 dark:bg-red-900/20' : ''}`}>
                        <span className="text-gray-700 dark:text-gray-300">
                          {option.pe ? '0' : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-gray-400">
                    No options data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Greeks Summary */}
      {optionsData?.options && optionsData.options.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Greeks Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Call Options</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {optionsData.options.filter(o => o.series === 'CE').length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Put Options</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {optionsData.options.filter(o => o.series === 'PE').length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">ATM Strike</p>
              <p className="text-gray-900 dark:text-white font-medium">{atmStrike?.strike || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Underlying Price</p>
              <p className="text-gray-900 dark:text-white font-medium">₹{underlyingPrice.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsChain;