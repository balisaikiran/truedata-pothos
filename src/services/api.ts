import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  AuthResponse, 
  LTPResponse, 
  BarData, 
  TickData, 
  Symbol, 
  SymbolSearchResponse, 
  OptionsChainResponse, 
  OptionData,
  FNOStockData,
  FNOMarketSummary,
  FNOStockWithChain
} from '../../shared/types';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_URL || '',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        
        // Handle specific error types
        if (error.response?.data) {
          const errorData = error.response.data;
          
          // Add error type information for better handling
          if (errorData.isQuotaExceeded) {
            error.isQuotaExceeded = true;
            error.quotaMessage = errorData.message;
          }
          
          if (errorData.isRateLimited) {
            error.isRateLimited = true;
            error.retryAfter = errorData.retryAfter;
          }
          
          if (errorData.isAuthError) {
            error.isAuthError = true;
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  // Retry logic with exponential backoff
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.response?.status === 401 || error.isQuotaExceeded) {
          throw error;
        }
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
    
    throw lastError;
   }

  // Authentication
  async login(username: string, password: string): Promise<AuthResponse> {
    const response: AxiosResponse<AuthResponse> = await this.api.post('/api/auth/login', {
      username,
      password,
    });
    return response.data;
  }

  async verifyToken(): Promise<{ valid: boolean; user?: any }> {
    const response = await this.api.get('/api/auth/verify');
    return response.data;
  }

  async logout(): Promise<void> {
    await this.api.post('/api/auth/logout');
  }

  // Data endpoints
  async getLTP(symbol: string): Promise<LTPResponse> {
    return this.retryWithBackoff(async () => {
      const response: AxiosResponse<LTPResponse> = await this.api.get(`/api/data/ltp/${symbol}`);
      return response.data;
    });
  }

  async getBars(
    symbol: string,
    from: string,
    to: string,
    interval: string
  ): Promise<BarData[]> {
    const response: AxiosResponse<BarData[]> = await this.api.get(
      `/api/data/bars/${symbol}`,
      {
        params: { from, to, interval },
      }
    );
    return response.data;
  }

  async getTicks(
    symbol: string,
    from: string,
    to: string
  ): Promise<TickData[]> {
    const response: AxiosResponse<TickData[]> = await this.api.get(
      `/api/data/ticks/${symbol}`,
      {
        params: { from, to },
      }
    );
    return response.data;
  }

  async getLastBars(
    symbol: string,
    count: number,
    interval: string
  ): Promise<BarData[]> {
    const response: AxiosResponse<BarData[]> = await this.api.get(
      `/api/data/lastbars/${symbol}`,
      {
        params: { count, interval },
      }
    );
    return response.data;
  }

  // Symbol endpoints
  async searchSymbols(
    query: string,
    segment?: string,
    limit?: number
  ): Promise<SymbolSearchResponse> {
    const response: AxiosResponse<SymbolSearchResponse> = await this.api.get(
      '/api/symbols/search',
      {
        params: { query, segment, limit },
      }
    );
    return response.data;
  }

  async getAllSymbols(segment: string): Promise<Symbol[]> {
    const response: AxiosResponse<Symbol[]> = await this.api.get(
      '/api/symbols/all',
      {
        params: { segment },
      }
    );
    return response.data;
  }

  async getSymbolDetails(symbol: string): Promise<Symbol> {
    const response: AxiosResponse<Symbol> = await this.api.get(
      `/api/symbols/details/${symbol}`
    );
    return response.data;
  }

  // Options endpoints
  async getOptionsChain(
    symbol: string,
    expiry: string
  ): Promise<OptionsChainResponse> {
    const response: AxiosResponse<OptionsChainResponse> = await this.api.get(
      `/api/options/chain/${symbol}`,
      {
        params: { expiry },
      }
    );
    return response.data;
  }

  async getOptionsGreeks(
    symbol: string,
    expiry: string,
    strike: number,
    series: string
  ): Promise<OptionData[]> {
    const response: AxiosResponse<OptionData[]> = await this.api.get(
      `/api/options/greeks/${symbol}`,
      {
        params: { expiry, strike, series },
      }
    );
    return response.data;
  }

  async getOptionLTP(symbol: string): Promise<OptionData> {
    const response: AxiosResponse<OptionData> = await this.api.get(
      `/api/options/ltp/${symbol}`
    );
    return response.data;
  }

  // F&O endpoints
  async testFNOAuth(): Promise<{ success: boolean; message: string; user: string; timestamp: string }> {
    console.log('Testing F&O authentication...');
    const response: AxiosResponse<{ success: boolean; message: string; user: string; timestamp: string }> = 
      await this.api.get('/api/fno/test');
    console.log('F&O auth test response:', response.data);
    return response.data;
  }

  async getFNOMarketData(): Promise<{ stocks: FNOStockData[]; fromCache: boolean; timestamp: string }> {
    console.log('Making request to /api/fno/market-data');
    const response: AxiosResponse<{ stocks: FNOStockData[]; fromCache: boolean; timestamp: string }> = 
      await this.api.get('/api/fno/market-data');
    console.log('F&O market data response:', response.data);
    return response.data;
  }

  async getFNOMarketSummary(): Promise<{ summary: FNOMarketSummary; fromCache: boolean; timestamp: string }> {
    console.log('Making request to /api/fno/market-summary');
    const response: AxiosResponse<{ summary: FNOMarketSummary; fromCache: boolean; timestamp: string }> = 
      await this.api.get('/api/fno/market-summary');
    console.log('F&O market summary response:', response.data);
    return response.data;
  }

  async getFNOOptionChain(symbol: string, expiry?: string): Promise<OptionsChainResponse> {
    console.log(`[API Service] Fetching option chain for ${symbol}, expiry: ${expiry || 'none'}`);
    console.log(`[API Service] Full URL will be: /api/fno/option-chain/${symbol}${expiry ? `?expiry=${expiry}` : ''}`);
    
    const response: AxiosResponse<OptionsChainResponse> = await this.api.get(
      `/api/fno/option-chain/${encodeURIComponent(symbol)}`, // URL encode the symbol
      {
        params: expiry ? { expiry } : {},
      }
    );
    
    console.log(`[API Service] Option chain response received for ${symbol}:`, {
      optionsCount: response.data?.options?.length || 0,
      underlyingPrice: response.data?.underlyingPrice || 0
    });
    
    return response.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.api.get('/api/health');
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;