// @ts-ignore – socket.io-client is optional; will be dynamically required only when WS_URL is provided
let io: any, Socket: any;
try {
  const socketIo = await import('socket.io-client');
  io = socketIo.io;
  Socket = socketIo.Socket;
} catch {
  // Module not available; leave io and Socket undefined
}
import { LiveDataUpdate, WebSocketMessage } from '../../shared/types';

class WebSocketService {
  private socket: typeof Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = (import.meta as any).env?.VITE_WS_URL;

      // If no websocket URL is provided, skip connecting (use API polling)
      if (!wsUrl) {
        console.warn('WebSocket URL not set (VITE_WS_URL). Skipping websocket connection.');
        this.socket = null;
        this.reconnectAttempts = 0;
        resolve();
        return;
      }
      
      this.socket = io(wsUrl, {
        auth: {
          token
        },
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          this.handleReconnect();
        }
      });

      this.socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      this.socket.on('ltp_update', (data: LiveDataUpdate) => {
        this.emit('ltp_update', data);
      });

      this.socket.on('market_status', (data: any) => {
        this.emit('market_status', data);
      });

      this.socket.on('notification', (data: any) => {
        this.emit('notification', data);
      });
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (this.socket) {
          this.socket.connect();
        }
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  subscribe(symbol: string, token?: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe', { symbol, token });
      console.log(`Subscribed to ${symbol}`);
    } else {
      console.warn('WebSocket not connected, cannot subscribe to', symbol);
    }
  }

  unsubscribe(symbol: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('unsubscribe', symbol);
      console.log(`Unsubscribed from ${symbol}`);
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data));
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionState(): string {
    if (!this.socket) return 'disconnected';
    return this.socket.connected ? 'connected' : 'connecting';
  }
}

export { WebSocketService };
export const websocketService = new WebSocketService();
export default websocketService;