import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown, Star, Filter, Download, Eye } from 'lucide-react';
import { format } from 'date-fns';
import type { Symbol, SymbolSearchResponse } from '../../shared/types';
import { useTheme } from '../contexts/ThemeContext';
import axios from 'axios';

interface SymbolSearchProps {
  onSymbolSelect?: (symbol: string) => void;
}

const SymbolSearch: React.FC<SymbolSearchProps> = ({ onSymbolSelect }) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('NSE');
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [filteredSymbols, setFilteredSymbols] = useState<Symbol[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  const segments = ['NSE', 'BSE', 'MCX', 'NCDEX'];
  const instrumentTypes = ['EQ', 'FUT', 'OPT', 'INDEX'];

  // Load favorites from localStorage
  useEffect(() => {
    const savedFavorites = localStorage.getItem('symbol-favorites');
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  // Save favorites to localStorage
  const saveFavorites = (newFavorites: string[]) => {
    setFavorites(newFavorites);
    localStorage.setItem('symbol-favorites', JSON.stringify(newFavorites));
  };

  // Fetch all symbols for selected segment
  const fetchSymbols = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await axios.get<SymbolSearchResponse>('/api/symbols/all', {
        params: { segment: selectedSegment }
      });
      
      setSymbols(response.data.symbols);
      setFilteredSymbols(response.data.symbols);
      setCurrentPage(1);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch symbols');
      setSymbols([]);
      setFilteredSymbols([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Search symbols
  const searchSymbols = async (query: string) => {
    if (!query.trim()) {
      setFilteredSymbols(symbols);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await axios.get<SymbolSearchResponse>('/api/symbols/search', {
        params: {
          query: query.trim(),
          segment: selectedSegment,
          limit: 100
        }
      });
      
      setFilteredSymbols(response.data.symbols);
      setCurrentPage(1);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Search failed');
      setFilteredSymbols([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch symbol details
  const fetchSymbolDetails = async (symbol: string) => {
    try {
      const response = await axios.get<Symbol>(`/api/symbols/details/${symbol}`);
      setSelectedSymbol(response.data);
      setShowDetails(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch symbol details');
    }
  };

  // Handle search input change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchSymbols(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedSegment]);

  // Load symbols when segment changes
  useEffect(() => {
    fetchSymbols();
  }, [selectedSegment]);

  // Toggle favorite
  const toggleFavorite = (symbolName: string) => {
    const newFavorites = favorites.includes(symbolName)
      ? favorites.filter(f => f !== symbolName)
      : [...favorites, symbolName];
    saveFavorites(newFavorites);
  };

  // Export symbols to CSV
  const exportToCSV = () => {
    const csvContent = [
      ['Symbol', 'Name', 'Segment', 'Instrument', 'Lot Size', 'Tick Size'].join(','),
      ...filteredSymbols.map(symbol => [
        symbol.symbol,
        `"${symbol.companyName}"`,
        symbol.segment,
        symbol.segment,
        symbol.lotSize || '',
        symbol.tickSize || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `symbols_${selectedSegment}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Pagination
  const totalPages = Math.ceil(filteredSymbols.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSymbols = filteredSymbols.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Symbol Search</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Search and explore symbols across different segments
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={exportToCSV}
            disabled={filteredSymbols.length === 0}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors duration-200 flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Search Input */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Search className="h-4 w-4 inline mr-1" />
              Search Symbols
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter symbol name or code..."
              className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Segment Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Filter className="h-4 w-4 inline mr-1" />
              Segment
            </label>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {segments.map(segment => (
                <option key={segment} value={segment}>{segment}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <span>Total Symbols: {filteredSymbols.length}</span>
            <span>Favorites: {favorites.length}</span>
            {searchQuery && (
              <span>Search Results: {filteredSymbols.length}</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span>Page {currentPage} of {totalPages}</span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Symbols Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Symbol
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Segment
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Instrument
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Lot Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Tick Size
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <span className="ml-2 text-gray-600 dark:text-gray-400">Loading symbols...</span>
                    </div>
                  </td>
                </tr>
              ) : currentSymbols.length > 0 ? (
                currentSymbols.map((symbol) => (
                  <tr key={`${symbol.symbol}-${symbol.segment}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <span className="text-gray-900 dark:text-white font-medium">{symbol.symbol}</span>
                        {favorites.includes(symbol.symbol) && (
                          <Star className="h-4 w-4 ml-2 text-yellow-400 fill-current" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-300 text-sm">{symbol.companyName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                        {symbol.segment}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        {symbol.segment}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-300 text-sm">
                        {symbol.lotSize || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-300 text-sm">
                        {symbol.tickSize || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => toggleFavorite(symbol.symbol)}
                          className={`p-1 rounded-md transition-colors duration-200 ${
                            favorites.includes(symbol.symbol)
                              ? 'text-yellow-400 hover:text-yellow-300'
                              : 'text-gray-400 hover:text-yellow-400'
                          }`}
                          title={favorites.includes(symbol.symbol) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star className={`h-4 w-4 ${favorites.includes(symbol.symbol) ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          onClick={() => fetchSymbolDetails(symbol.symbol)}
                          className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-200"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {onSymbolSelect && (
                          <button
                            onClick={() => onSymbolSelect(symbol.symbol)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition-colors duration-200"
                          >
                            Select
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-600 dark:text-gray-400">
                    {searchQuery ? 'No symbols found matching your search' : 'No symbols available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white dark:bg-gray-700 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredSymbols.length)} of {filteredSymbols.length} results
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 text-gray-900 dark:text-white text-sm rounded-md transition-colors duration-200"
              >
                Previous
              </button>
              
              {/* Page Numbers */}
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors duration-200 ${
                        pageNum === currentPage
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 text-gray-900 dark:text-white text-sm rounded-md transition-colors duration-200"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Symbol Details Modal */}
      {showDetails && selectedSymbol && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Symbol Details</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors duration-200"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{selectedSymbol.symbol}</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-4">{selectedSymbol.companyName}</p>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Segment:</span>
                    <span className="text-gray-900 dark:text-white">{selectedSymbol.segment}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Instrument:</span>
                    <span className="text-gray-900 dark:text-white">{selectedSymbol.segment}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Lot Size:</span>
                    <span className="text-gray-900 dark:text-white">{selectedSymbol.lotSize || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Tick Size:</span>
                    <span className="text-gray-900 dark:text-white">{selectedSymbol.tickSize || 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center space-x-4 mb-4">
                  <button
                    onClick={() => toggleFavorite(selectedSymbol.symbol)}
                    className={`flex items-center px-4 py-2 rounded-md transition-colors duration-200 ${
                      favorites.includes(selectedSymbol.symbol)
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-300'
                    }`}
                  >
                    <Star className={`h-4 w-4 mr-2 ${favorites.includes(selectedSymbol.symbol) ? 'fill-current' : ''}`} />
                    {favorites.includes(selectedSymbol.symbol) ? 'Remove from Favorites' : 'Add to Favorites'}
                  </button>
                </div>
                
                {onSymbolSelect && (
                  <button
                    onClick={() => {
                      onSymbolSelect(selectedSymbol.symbol);
                      setShowDetails(false);
                    }}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors duration-200"
                  >
                    Select This Symbol
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SymbolSearch;