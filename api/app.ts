import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth';
import dataRoutes from './routes/data';
import symbolRoutes from './routes/symbols';
import optionsRoutes from './routes/options';
import fnoRoutes from './routes/fno';
import WebSocketService from './services/websocketService';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/symbols', symbolRoutes);
app.use('/api/options', optionsRoutes);
app.use('/api/fno', fnoRoutes);

// Debug: Log all registered routes
console.log('📋 Registered API Routes:');
console.log('  - /api/auth');
console.log('  - /api/data');
console.log('  - /api/symbols');
console.log('  - /api/options');
console.log('  - /api/fno (including /option-chain/:symbol)');

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Initialize WebSocket service
const wsService = new WebSocketService(io);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up WebSocket service...');
  wsService.cleanup();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, cleaning up WebSocket service...');
  wsService.cleanup();
});

// Export WebSocket service for use in other modules
export { wsService };

export { app, server, io };
export default app;
