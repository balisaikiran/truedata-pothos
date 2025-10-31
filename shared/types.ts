// Shared TypeScript interfaces for TrueData Live Data Solution

export interface Symbol {
  symbol: string;
  companyName: string;
  segment: 'EQ' | 'FO' | 'MCX';
  isin: string;
  tickSize: number;
  lotSize?: number;
  isActive: boolean;
}

export interface TickData {
  symbol: string;
  price: number;
  volume: number;
  timestamp: string;
  bidPrice?: number;
  askPrice?: number;
}

export interface BarData {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval: string;
}

export interface OptionData {
  symbol: string;
  optionSymbol: string;
  strike: number;
  series: 'CE' | 'PE';
  expiry: string;
  ltp: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  timestamp: string;
}

export interface LiveDataUpdate {
  type: 'ltp' | 'tick' | 'bar' | 'option';
  symbol: string;
  data: TickData | BarData | OptionData;
  timestamp: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  trueDataToken?: string;
  user?: User;
  message?: string;
}

export interface LTPResponse {
  symbol: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  bidPrice?: number;
  askPrice?: number;
  high?: number;
  low?: number;
}

export interface SymbolSearchResponse {
  symbols: Symbol[];
  total: number;
}

export interface OptionsChainResponse {
  options: OptionData[];
  underlyingPrice: number;
  expiry: string;
}

export interface User {
  id: string;
  username: string;
  trueDataToken?: string;
  lastLogin?: string;
}

export interface Session {
  id: string;
  userId: string;
  jwtToken: string;
  expiresAt: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

export interface CacheData {
  [key: string]: any;
  ttl: number;
}

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'data' | 'error';
  symbol?: string;
  data?: any;
  error?: string;
}

// F&O specific interfaces
export interface FNOStockData {
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

export interface FNOMarketSummary {
  activeSignals: number;
  avgIV: number;
  topGainer: string;
  topLoser: string;
  totalStocks: number;
}

export interface FNOOptionStrike {
  strike: number;
  callBid: number;
  callAsk: number;
  callOI: number;
  putBid: number;
  putAsk: number;
  putOI: number;
  moneyness: number;
}

export interface FNOStockWithChain extends FNOStockData {
  strikes: FNOOptionStrike[];
}