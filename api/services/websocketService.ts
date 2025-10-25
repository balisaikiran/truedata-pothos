import { Server } from 'socket.io';
import axios from 'axios';
import type { LiveDataUpdate, LTPResponse } from '../../shared/types';

class WebSocketService {
  private io: Server;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private subscribedSymbols: Set<string> = new Set();

  constructor(io: Server) {
    this.io = io;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('subscribe', (data: { symbol: string; token?: string }) => {
        this.handleSubscription(socket, data.symbol, data.token);
      });

      socket.on('unsubscribe', (symbol: string) => {
        this.handleUnsubscription(socket, symbol);
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.handleDisconnection(socket);
      });
    });
  }

  private async handleSubscription(socket: any, symbol: string, token?: string) {
    try {
      const room = `symbol:${symbol}`;
      socket.join(room);
      console.log(`Client ${socket.id} subscribed to ${symbol}`);

      // Add symbol to subscribed symbols
      this.subscribedSymbols.add(symbol);

      // Start real-time data fetching for this symbol if not already started
      if (!this.intervals.has(symbol)) {
        this.startRealTimeData(symbol, token);
      }

      // Send initial data
      const initialData = await this.fetchLTPData(symbol, token);
      if (initialData) {
        socket.emit('ltp_update', {
          symbol,
          data: initialData,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Error subscribing to ${symbol}:`, error);
      socket.emit('error', {
        message: `Failed to subscribe to ${symbol}`,
        symbol
      });
    }
  }

  private handleUnsubscription(socket: any, symbol: string) {
    const room = `symbol:${symbol}`;
    socket.leave(room);
    console.log(`Client ${socket.id} unsubscribed from ${symbol}`);

    // Check if any clients are still subscribed to this symbol
    const roomClients = this.io.sockets.adapter.rooms.get(room);
    if (!roomClients || roomClients.size === 0) {
      // No more clients subscribed, stop fetching data
      this.stopRealTimeData(symbol);
      this.subscribedSymbols.delete(symbol);
    }
  }

  private handleDisconnection(socket: any) {
    // Clean up any subscriptions for this socket
    // Socket.IO automatically handles room cleanup on disconnect
    
    // Check all subscribed symbols and stop data fetching if no clients remain
    this.subscribedSymbols.forEach(symbol => {
      const room = `symbol:${symbol}`;
      const roomClients = this.io.sockets.adapter.rooms.get(room);
      if (!roomClients || roomClients.size === 0) {
        this.stopRealTimeData(symbol);
        this.subscribedSymbols.delete(symbol);
      }
    });
  }

  private startRealTimeData(symbol: string, token?: string) {
    console.log(`Starting real-time data for ${symbol}`);
    
    // Fetch data every 1 second (adjust based on TrueData API limits)
    const interval = setInterval(async () => {
      try {
        const ltpData = await this.fetchLTPData(symbol, token);
        if (ltpData) {
          const update: LiveDataUpdate = {
            symbol,
            data: ltpData,
            timestamp: new Date().toISOString()
          };

          // Broadcast to all clients subscribed to this symbol
          this.io.to(`symbol:${symbol}`).emit('ltp_update', update);
        }
      } catch (error) {
        console.error(`Error fetching real-time data for ${symbol}:`, error);
        
        // Emit error to subscribed clients
        this.io.to(`symbol:${symbol}`).emit('error', {
          message: `Failed to fetch data for ${symbol}`,
          symbol,
          timestamp: new Date().toISOString()
        });
      }
    }, 1000); // 1 second interval

    this.intervals.set(symbol, interval);
  }

  private stopRealTimeData(symbol: string) {
    console.log(`Stopping real-time data for ${symbol}`);
    
    const interval = this.intervals.get(symbol);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(symbol);
    }
  }

  private async fetchLTPData(symbol: string, token?: string): Promise<LTPResponse | null> {
    try {
      const headers: any = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await axios.get(
        `${process.env.TRUEDATA_HISTORY_URL}/historyapi/getLTP`,
        {
          params: { symbol, response: 'json' },
          headers,
          timeout: 5000 // 5 second timeout
        }
      );

      return response.data;
    } catch (error) {
      console.error(`Error fetching LTP for ${symbol}:`, error);
      return null;
    }
  }

  // Method to broadcast market status updates
  public broadcastMarketStatus(status: 'open' | 'closed' | 'pre-open' | 'post-close') {
    this.io.emit('market_status', {
      status,
      timestamp: new Date().toISOString()
    });
  }

  // Method to broadcast system notifications
  public broadcastNotification(message: string, type: 'info' | 'warning' | 'error' = 'info') {
    this.io.emit('notification', {
      message,
      type,
      timestamp: new Date().toISOString()
    });
  }

  // Cleanup method
  public cleanup() {
    console.log('Cleaning up WebSocket service...');
    
    // Clear all intervals
    this.intervals.forEach((interval, symbol) => {
      clearInterval(interval);
      console.log(`Stopped real-time data for ${symbol}`);
    });
    
    this.intervals.clear();
    this.subscribedSymbols.clear();
  }
}

export default WebSocketService;