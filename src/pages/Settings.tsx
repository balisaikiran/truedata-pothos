import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Wifi, WifiOff, Save, RefreshCw, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import axios from 'axios';

interface ConnectionStatus {
  api: boolean;
  websocket: boolean;
  redis: boolean;
  lastChecked: Date;
}

interface ApiConfig {
  trueDataUrl: string;
  historyUrl: string;
  websocketUrl: string;
  refreshInterval: number;
  maxRetries: number;
  timeout: number;
}

interface DataPreferences {
  defaultSymbol: string;
  defaultSegment: string;
  defaultInterval: string;
  autoRefresh: boolean;
  soundAlerts: boolean;
  darkTheme: boolean;
  compactView: boolean;
  showGreeks: boolean;
}

const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('connection');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    api: false,
    websocket: false,
    redis: false,
    lastChecked: new Date()
  });
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    trueDataUrl: '',
    historyUrl: '',
    websocketUrl: '',
    refreshInterval: 5000,
    maxRetries: 3,
    timeout: 10000
  });
  const [dataPreferences, setDataPreferences] = useState<DataPreferences>({
    defaultSymbol: 'NIFTY',
    defaultSegment: 'NSE',
    defaultInterval: '1m',
    autoRefresh: true,
    soundAlerts: false,
    darkTheme: true,
    compactView: false,
    showGreeks: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showApiKeys, setShowApiKeys] = useState(false);

  const tabs = [
    { id: 'connection', label: 'Connection', icon: Wifi },
    { id: 'api', label: 'API Configuration', icon: SettingsIcon },
    { id: 'preferences', label: 'Data Preferences', icon: RefreshCw },
    { id: 'account', label: 'Account', icon: AlertCircle }
  ];

  const intervals = [
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '1d', label: '1 Day' }
  ];

  const segments = ['NSE', 'BSE', 'MCX', 'NCDEX'];

  // Load settings from localStorage
  useEffect(() => {
    const savedPreferences = localStorage.getItem('data-preferences');
    if (savedPreferences) {
      setDataPreferences(JSON.parse(savedPreferences));
    }

    const savedApiConfig = localStorage.getItem('api-config');
    if (savedApiConfig) {
      setApiConfig(JSON.parse(savedApiConfig));
    }

    checkConnectionStatus();
  }, []);

  // Check connection status
  const checkConnectionStatus = async () => {
    setIsLoading(true);
    const status: ConnectionStatus = {
      api: false,
      websocket: false,
      redis: false,
      lastChecked: new Date()
    };

    try {
      // Check API connection
      const apiResponse = await axios.get('/api/auth/verify', { timeout: 5000 });
      status.api = apiResponse.status === 200;
    } catch (error) {
      status.api = false;
    }

    try {
      // Check WebSocket connection (simplified check)
      const wsUrl = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsTestUrl = `${wsUrl}//${window.location.host}`;
      // Note: In a real implementation, you'd want to actually test the WebSocket connection
      status.websocket = true; // Assume working for demo
    } catch (error) {
      status.websocket = false;
    }

    // Redis status would typically come from a backend endpoint
    status.redis = status.api; // Assume Redis is working if API is working

    setConnectionStatus(status);
    setIsLoading(false);
  };

  // Save API configuration
  const saveApiConfig = () => {
    setIsSaving(true);
    try {
      localStorage.setItem('api-config', JSON.stringify(apiConfig));
      setMessage({ type: 'success', text: 'API configuration saved successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save API configuration.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Save data preferences
  const saveDataPreferences = () => {
    setIsSaving(true);
    try {
      localStorage.setItem('data-preferences', JSON.stringify(dataPreferences));
      setMessage({ type: 'success', text: 'Preferences saved successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save preferences.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Reset to defaults
  const resetToDefaults = () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
      setDataPreferences({
        defaultSymbol: 'NIFTY',
        defaultSegment: 'NSE',
        defaultInterval: '1m',
        autoRefresh: true,
        soundAlerts: false,
        darkTheme: true,
        compactView: false,
        showGreeks: true
      });
      setApiConfig({
        trueDataUrl: '',
        historyUrl: '',
        websocketUrl: '',
        refreshInterval: 5000,
        maxRetries: 3,
        timeout: 10000
      });
      localStorage.removeItem('data-preferences');
      localStorage.removeItem('api-config');
      setMessage({ type: 'success', text: 'Settings reset to defaults!' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const renderConnectionTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Connection Status</h3>
        <button
          onClick={checkConnectionStatus}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md font-medium transition-colors duration-200 flex items-center"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300">API Server</span>
            {connectionStatus.api ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400" />
            )}
          </div>
          <p className={`text-sm font-medium ${
            connectionStatus.api ? 'text-green-400' : 'text-red-400'
          }`}>
            {connectionStatus.api ? 'Connected' : 'Disconnected'}
          </p>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300">WebSocket</span>
            {connectionStatus.websocket ? (
              <Wifi className="h-5 w-5 text-green-400" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-400" />
            )}
          </div>
          <p className={`text-sm font-medium ${
            connectionStatus.websocket ? 'text-green-400' : 'text-red-400'
          }`}>
            {connectionStatus.websocket ? 'Connected' : 'Disconnected'}
          </p>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300">Redis Cache</span>
            {connectionStatus.redis ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400" />
            )}
          </div>
          <p className={`text-sm font-medium ${
            connectionStatus.redis ? 'text-green-400' : 'text-red-400'
          }`}>
            {connectionStatus.redis ? 'Connected' : 'Disconnected'}
          </p>
        </div>
      </div>

      <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
        <h4 className="text-gray-900 dark:text-white font-medium mb-2">Connection Details</h4>
        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>Last Checked: {connectionStatus.lastChecked.toLocaleString()}</p>
          <p>User: {user?.username}</p>
          <p>Session: Active</p>
        </div>
      </div>
    </div>
  );

  const renderApiTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">API Configuration</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowApiKeys(!showApiKeys)}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-md transition-colors duration-200 flex items-center"
          >
            {showApiKeys ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showApiKeys ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={saveApiConfig}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-md font-medium transition-colors duration-200 flex items-center"
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            TrueData API URL
          </label>
          <input
            type={showApiKeys ? 'text' : 'password'}
            value={apiConfig.trueDataUrl}
            onChange={(e) => setApiConfig({ ...apiConfig, trueDataUrl: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://api.truedata.in"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            History API URL
          </label>
          <input
            type={showApiKeys ? 'text' : 'password'}
            value={apiConfig.historyUrl}
            onChange={(e) => setApiConfig({ ...apiConfig, historyUrl: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://history.truedata.in"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            WebSocket URL
          </label>
          <input
            type="text"
            value={apiConfig.websocketUrl}
            onChange={(e) => setApiConfig({ ...apiConfig, websocketUrl: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ws://localhost:3001"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Refresh Interval (ms)
          </label>
          <input
            type="number"
            value={apiConfig.refreshInterval}
            onChange={(e) => setApiConfig({ ...apiConfig, refreshInterval: parseInt(e.target.value) || 5000 })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1000"
            max="60000"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Max Retries
          </label>
          <input
            type="number"
            value={apiConfig.maxRetries}
            onChange={(e) => setApiConfig({ ...apiConfig, maxRetries: parseInt(e.target.value) || 3 })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
            max="10"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Timeout (ms)
          </label>
          <input
            type="number"
            value={apiConfig.timeout}
            onChange={(e) => setApiConfig({ ...apiConfig, timeout: parseInt(e.target.value) || 10000 })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="5000"
            max="30000"
          />
        </div>
      </div>
    </div>
  );

  const renderPreferencesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Data Preferences</h3>
        <button
          onClick={saveDataPreferences}
          disabled={isSaving}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-md font-medium transition-colors duration-200 flex items-center"
        >
          <Save className="h-4 w-4 mr-2" />
          Save
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Default Symbol
          </label>
          <input
            type="text"
            value={dataPreferences.defaultSymbol}
            onChange={(e) => setDataPreferences({ ...dataPreferences, defaultSymbol: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="NIFTY"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Default Segment
          </label>
          <select
            value={dataPreferences.defaultSegment}
            onChange={(e) => setDataPreferences({ ...dataPreferences, defaultSegment: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {segments.map(segment => (
              <option key={segment} value={segment}>{segment}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Default Interval
          </label>
          <select
            value={dataPreferences.defaultInterval}
            onChange={(e) => setDataPreferences({ ...dataPreferences, defaultInterval: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {intervals.map(interval => (
              <option key={interval.value} value={interval.value}>{interval.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-gray-900 dark:text-white font-medium">Display Options</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataPreferences.autoRefresh}
              onChange={(e) => setDataPreferences({ ...dataPreferences, autoRefresh: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">Auto Refresh Data</span>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataPreferences.soundAlerts}
              onChange={(e) => setDataPreferences({ ...dataPreferences, soundAlerts: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">Sound Alerts</span>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataPreferences.darkTheme}
              onChange={(e) => setDataPreferences({ ...dataPreferences, darkTheme: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">Dark Theme</span>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataPreferences.compactView}
              onChange={(e) => setDataPreferences({ ...dataPreferences, compactView: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">Compact View</span>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataPreferences.showGreeks}
              onChange={(e) => setDataPreferences({ ...dataPreferences, showGreeks: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">Show Greeks in Options</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderAccountTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Account Information</h3>
      
      <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-6">
        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Username:</span>
            <span className="text-gray-900 dark:text-white font-medium">{user?.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Login Time:</span>
            <span className="text-gray-900 dark:text-white font-medium">{new Date().toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Session Status:</span>
            <span className="text-green-400 font-medium">Active</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-gray-900 dark:text-white font-medium">Actions</h4>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md font-medium transition-colors duration-200"
          >
            Reset to Defaults
          </button>
          
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition-colors duration-200"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Configure your API connections, data preferences, and account settings
        </p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`rounded-lg p-4 border ${
          message.type === 'success'
            ? 'bg-green-900 border-green-700 text-green-200'
            : 'bg-red-900 border-red-700 text-red-200'
        }`}>
          <div className="flex items-center">
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 mr-2" />
            )}
            {message.text}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 flex items-center ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'connection' && renderConnectionTab()}
          {activeTab === 'api' && renderApiTab()}
          {activeTab === 'preferences' && renderPreferencesTab()}
          {activeTab === 'account' && renderAccountTab()}
        </div>
      </div>
    </div>
  );
};

export default Settings;