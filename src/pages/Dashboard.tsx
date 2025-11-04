import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart3, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { LTPResponse, BarData } from '../../shared/types';
import { apiService } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import ErrorDisplay from '../components/ErrorDisplay';

interface DashboardProps {
  selectedSymbol?: string;
}

interface ChartDataPoint {
  time: string;
  price: number;
  timestamp: number;
}

const Dashboard: React.FC<DashboardProps> = ({ selectedSymbol = 'RELIANCE' }) => {
  const [ltpData, setLtpData] = useState<LTPResponse | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const { theme } = useTheme();

  // Fetch LTP data
  const fetchLTPData = async () => {
    try {
      const response = await apiService.getLTP(selectedSymbol);
      setLtpData(response);
      setError(null);
      setLastUpdate(new Date());
      
      // Add to chart data
      if (response.ltp) {
        const newDataPoint: ChartDataPoint = {
          time: format(new Date(), 'HH:mm:ss'),
          price: response.ltp,
          timestamp: Date.now()
        };
        
        setChartData(prev => {
          const updated = [...prev, newDataPoint];
          // Keep only last 50 data points
          return updated.slice(-50);
        });
      }
    } catch (err: any) {
      console.error('LTP fetch error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch historical data for initial chart
  const fetchHistoricalData = async () => {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const response = await apiService.getBars(
        selectedSymbol,
        from.toISOString(),
        to.toISOString(),
        '1m'
      );
      
      if (response && response.length > 0) {
        const historicalChartData: ChartDataPoint[] = response.slice(-50).map((bar, index) => ({
          time: format(new Date(bar.timestamp), 'HH:mm'),
          price: bar.close,
          timestamp: new Date(bar.timestamp).getTime()
        }));
        
        setChartData(historicalChartData);
      }
    } catch (err) {
      console.warn('Failed to fetch historical data:', err);
    }
  };

  useEffect(() => {
    // Initial data fetch
    fetchHistoricalData();
    fetchLTPData();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchLTPData, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, [selectedSymbol]);

  const calculatePriceChange = () => {
    if (!ltpData || chartData.length < 2) return { change: 0, changePercent: 0 };
    
    const currentPrice = ltpData.ltp;
    const previousPrice = chartData[chartData.length - 2]?.price || currentPrice;
    const change = currentPrice - previousPrice;
    const changePercent = previousPrice !== 0 ? (change / previousPrice) * 100 : 0;
    
    return { change, changePercent };
  };

  const { change, changePercent } = calculatePriceChange();
  const isPositive = change >= 0;

  if (isLoading && !ltpData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading market data...</p>
        </div>
      </div>
    );
  }

  if (error && !ltpData) {
    return (
      <ErrorDisplay 
        error={error} 
        onRetry={() => {
          setError(null);
          setIsLoading(true);
          fetchLTPData();
        }}
        className="max-w-2xl mx-auto mt-8"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Market Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Real-time market data for {selectedSymbol}</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="h-4 w-4" />
          <span>Last updated: {format(lastUpdate, 'HH:mm:ss')}</span>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Current Price */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Price</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                ₹{ltpData?.ltp?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Price Change */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Change</p>
              <p className={`text-2xl font-bold mt-1 ${
                isPositive ? 'text-green-400' : 'text-red-400'
              }`}>
                {isPositive ? '+' : ''}₹{change.toFixed(2)}
              </p>
            </div>
            <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
              isPositive ? 'bg-green-600' : 'bg-red-600'
            }`}>
              {isPositive ? (
                <TrendingUp className="h-6 w-6 text-white" />
              ) : (
                <TrendingDown className="h-6 w-6 text-white" />
              )}
            </div>
          </div>
        </div>

        {/* Percentage Change */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Change %</p>
              <p className={`text-2xl font-bold mt-1 ${
                isPositive ? 'text-green-400' : 'text-red-400'
              }`}>
                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
              </p>
            </div>
            <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
              isPositive ? 'bg-green-600' : 'bg-red-600'
            }`}>
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Volume */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Volume</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {ltpData?.volume?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="h-12 w-12 bg-purple-600 rounded-lg flex items-center justify-center">
              <Activity className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Live Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Live Price Chart</h2>
          <div className="flex items-center space-x-2">
            <div className={`h-2 w-2 rounded-full ${
              error ? 'bg-red-500' : 'bg-green-500 animate-pulse'
            }`}></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {error ? 'Disconnected' : 'Live'}
            </span>
          </div>
        </div>
        
        <div className="h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
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
                  formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Price']}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3B82F6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 dark:text-gray-400">No chart data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Additional Info */}
      {ltpData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Market Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">LTP</p>
              <p className="text-gray-900 dark:text-white font-medium">₹{ltpData.ltp.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">High</p>
              <p className="text-gray-900 dark:text-white font-medium">₹{ltpData.high?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Low</p>
              <p className="text-gray-900 dark:text-white font-medium">₹{ltpData.low?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Change</p>
              <p className="text-gray-900 dark:text-white font-medium">₹{ltpData.change.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;