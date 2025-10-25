import { format, parseISO } from 'date-fns';

// Number formatting utilities
export const formatPrice = (price: number, decimals: number = 2): string => {
  return price.toFixed(decimals);
};

export const formatVolume = (volume: number): string => {
  if (volume >= 10000000) {
    return `${(volume / 10000000).toFixed(1)}Cr`;
  } else if (volume >= 100000) {
    return `${(volume / 100000).toFixed(1)}L`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toString();
};

export const formatPercentage = (value: number, decimals: number = 2): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

export const formatChange = (change: number, decimals: number = 2): string => {
  return `${change >= 0 ? '+' : ''}${change.toFixed(decimals)}`;
};

// Date formatting utilities
export const formatDateTime = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return format(date, 'dd/MM/yyyy HH:mm:ss');
  } catch {
    return dateString;
  }
};

export const formatDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return format(date, 'dd/MM/yyyy');
  } catch {
    return dateString;
  }
};

export const formatTime = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return format(date, 'HH:mm:ss');
  } catch {
    return dateString;
  }
};

// Financial calculations
export const calculateChange = (current: number, previous: number): number => {
  return current - previous;
};

export const calculatePercentageChange = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// Greeks formatting
export const formatGreek = (value: number, decimals: number = 4): string => {
  return value.toFixed(decimals);
};

// Color utilities for price changes
export const getPriceChangeColor = (change: number): string => {
  if (change > 0) return 'text-green-500';
  if (change < 0) return 'text-red-500';
  return 'text-gray-400';
};

export const getPriceChangeBgColor = (change: number): string => {
  if (change > 0) return 'bg-green-500/10';
  if (change < 0) return 'bg-red-500/10';
  return 'bg-gray-500/10';
};

// Options utilities
export const getOptionType = (symbol: string): 'CE' | 'PE' | 'UNKNOWN' => {
  if (symbol.includes('CE')) return 'CE';
  if (symbol.includes('PE')) return 'PE';
  return 'UNKNOWN';
};

export const extractStrikePrice = (symbol: string): number => {
  const match = symbol.match(/(\d+)(CE|PE)/);
  return match ? parseInt(match[1]) : 0;
};

export const isITM = (strikePrice: number, underlyingPrice: number, optionType: 'CE' | 'PE'): boolean => {
  if (optionType === 'CE') {
    return underlyingPrice > strikePrice;
  } else {
    return underlyingPrice < strikePrice;
  }
};

export const isATM = (strikePrice: number, underlyingPrice: number, threshold: number = 50): boolean => {
  return Math.abs(strikePrice - underlyingPrice) <= threshold;
};

// CSV export utility
export const exportToCSV = (data: any[], filename: string): void => {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// Validation utilities
export const isValidSymbol = (symbol: string): boolean => {
  return /^[A-Z0-9-]+$/.test(symbol);
};

export const isValidDate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

// Storage utilities
export const getStorageItem = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

export const setStorageItem = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};