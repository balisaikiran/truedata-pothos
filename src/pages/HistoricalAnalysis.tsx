import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar, Download, BarChart3, TrendingUp, Clock, Filter } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { BarData, TickData } from '../../shared/types';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext';

interface HistoricalAnalysisProps {
  selectedSymbol?: string;
}

type ViewType = 'bars' | 'ticks';
type IntervalType = '1m' | '5m' | '15m' | '1h' | '1d';

const HistoricalAnalysis: React.FC<HistoricalAnalysisProps> = ({ selectedSymbol = 'RELIANCE' }) => {
  const [viewType, setViewType] = useState<ViewType>('bars');
  const [interval, setInterval] = useState<IntervalType>('5m');
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [barData, setBarData] = useState<BarData[]>([]);
  const [tickData, setTickData] = useState<TickData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();

  const fetchBarData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const from = startOfDay(new Date(fromDate));
      const to = endOfDay(new Date(toDate));
      
      const response = await axios.get<BarData[]>(`/api/data/bars/${selectedSymbol}`, {
        params: {
          from: from.toISOString(),
          to: to.toISOString(),
          interval
        }
      });
      
      setBarData(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch bar data');
      setBarData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTickData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const from = startOfDay(new Date(fromDate));
      const to = endOfDay(new Date(toDate));
      
      const response = await axios.get<TickData[]>(`/api/data/ticks/${selectedSymbol}`, {
        params: {
          from: from.toISOString(),
          to: to.toISOString()
        }
      });
      
      setTickData(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch tick data');
      setTickData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    if (viewType === 'bars') {
      fetchBarData();
    } else {
      fetchTickData();
    }
  };

  const exportToCSV = () => {
    const data = viewType === 'bars' ? barData : tickData;
    if (data.length === 0) return;

    let csvContent = '';
    
    if (viewType === 'bars') {
      csvContent = 'Timestamp,Open,High,Low,Close,Volume\n';
      barData.forEach(bar => {
        csvContent += `${bar.timestamp},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume}\n`;
      });
    } else {
      csvContent = 'Timestamp,Price,Volume\n';
      tickData.forEach(tick => {
        csvContent += `${tick.timestamp},${tick.price},${tick.volume}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedSymbol}_${viewType}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    handleSearch();
  }, [selectedSymbol, viewType]);

  const formatChartData = () => {
    if (viewType === 'bars') {
      return barData.map(bar => ({
        ...bar,
        time: format(new Date(bar.timestamp), interval === '1d' ? 'MMM dd' : 'HH:mm'),
        timestamp: new Date(bar.timestamp).getTime()
      }));
    } else {
      return tickData.slice(-100).map(tick => ({
        ...tick,
        time: format(new Date(tick.timestamp), 'HH:mm:ss'),
        timestamp: new Date(tick.timestamp).getTime()
      }));
    }
  };

  const chartData = formatChartData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Historical Analysis</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Historical market data for {selectedSymbol}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* View Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data Type
            </label>
            <select
              value={viewType}
              onChange={(e) => setViewType(e.target.value as ViewType)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="bars">OHLC Bars</option>
              <option value="ticks">Tick Data</option>
            </select>
          </div>

          {/* Interval (only for bars) */}
          {viewType === 'bars' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Interval
              </label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as IntervalType)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="1d">1 Day</option>
              </select>
            </div>
          )}

          {/* From Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search Button */}
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md font-medium transition-colors duration-200 flex items-center justify-center"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Filter className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </button>
          </div>

          {/* Export Button */}
          <div className="flex items-end">
            <button
              onClick={exportToCSV}
              disabled={chartData.length === 0}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors duration-200 flex items-center justify-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {viewType === 'bars' ? 'OHLC Chart' : 'Tick Data Chart'}
          </h2>
          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
            <span>Data Points: {chartData.length}</span>
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span>Updated: {format(new Date(), 'HH:mm:ss')}</span>
            </div>
          </div>
        </div>
        
        <div className="h-96">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading historical data...</p>
              </div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {viewType === 'bars' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                  <XAxis 
                    dataKey="time" 
                    stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    fontSize={12}
                  />
                  <YAxis 
                    stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    fontSize={12}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
                      border: theme === 'dark' ? '1px solid #374151' : '1px solid #E5E7EB',
                      borderRadius: '8px',
                      color: theme === 'dark' ? '#F9FAFB' : '#111827'
                    }}
                    formatter={(value: number, name: string) => {
                      const formatValue = `₹${value.toFixed(2)}`;
                      const formatName = name.charAt(0).toUpperCase() + name.slice(1);
                      return [formatValue, formatName];
                    }}
                  />
                  <Bar dataKey="close" fill="#3B82F6" />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                  <XAxis 
                    dataKey="time" 
                    stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    fontSize={12}
                  />
                  <YAxis 
                    stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'}
                    fontSize={12}
                    domain={['dataMin - 0.1', 'dataMax + 0.1']}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
                      border: theme === 'dark' ? '1px solid #374151' : '1px solid #E5E7EB',
                      borderRadius: '8px',
                      color: theme === 'dark' ? '#F9FAFB' : '#111827'
                    }}
                    formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Price']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#10B981" 
                    strokeWidth={1}
                    dot={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No data available for the selected period</p>
                <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">Try adjusting the date range or interval</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Summary */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Data Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {viewType === 'bars' && barData.length > 0 && (
              <>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Highest</p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    ₹{Math.max(...barData.map(b => b.high)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Lowest</p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    ₹{Math.min(...barData.map(b => b.low)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Avg Volume</p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    {Math.round(barData.reduce((sum, b) => sum + b.volume, 0) / barData.length).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Bars</p>
                  <p className="text-gray-900 dark:text-white font-medium">{barData.length}</p>
                </div>
              </>
            )}
            
            {viewType === 'ticks' && tickData.length > 0 && (
              <>
                <div>
                  <p className="text-sm text-gray-400">Highest Price</p>
                  <p className="text-white font-medium">
                    ₹{Math.max(...tickData.map(t => t.price)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Lowest Price</p>
                  <p className="text-white font-medium">
                    ₹{Math.min(...tickData.map(t => t.price)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Total Volume</p>
                  <p className="text-white font-medium">
                    {tickData.reduce((sum, t) => sum + t.volume, 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Total Ticks</p>
                  <p className="text-white font-medium">{tickData.length}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoricalAnalysis;