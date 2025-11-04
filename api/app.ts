import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/auth';
import dataRoutes from './routes/data';
import symbolRoutes from './routes/symbols';
import optionsRoutes from './routes/options';
import fnoRoutes from './routes/fno';

dotenv.config();

// Check if running in serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;

const app = express();

// Initialize HTTP server and Socket.IO only if not in serverless mode
// WebSocket is not supported in Vercel serverless functions
let server: ReturnType<typeof createServer> | null = null;
let io: any = null;
let wsService: any = null;

// Export function to initialize WebSocket (called from server.ts for local development)
export async function initializeWebSocket() {
  if (isServerless) {
    console.log('⚠️  Running in serverless mode - WebSocket disabled');
    return;
  }

  try {
    const { Server } = await import('socket.io');
    const WebSocketService = (await import('./services/websocketService')).default;
    
    server = createServer(app);
    io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST']
      }
    });

    // Initialize WebSocket service
    wsService = new WebSocketService(io);

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, cleaning up WebSocket service...');
      wsService?.cleanup();
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, cleaning up WebSocket service...');
      wsService?.cleanup();
    });

    console.log('✅ WebSocket initialized successfully');
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error);
  }
}

if (isServerless) {
  console.log('⚠️  Running in serverless mode - WebSocket disabled');
}

// Middleware
const allowedOrigins = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.some(allowed => origin === allowed || origin.includes(allowed))) {
      callback(null, true);
    } else {
      // In production, allow Vercel preview and production URLs
      if (process.env.VERCEL) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true
}));
app.use(express.json());

// Async error wrapper middleware - catches unhandled promise rejections in async routes
const asyncHandler = (fn: Function) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

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
    version: '1.0.0',
    mode: isServerless ? 'serverless' : 'server',
    env: {
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasTrueDataApi: !!process.env.TRUEDATA_API_URL,
      hasTrueDataHistory: !!process.env.TRUEDATA_HISTORY_URL
    }
  });
});

// Global error handler middleware (must be last)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error handler:', err);
  
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode.toString(),
      message: err.message || 'A server error has occurred',
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        details: err
      })
    }
  });
});

// 404 handler (must be after all routes)
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: '404',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Export WebSocket service for use in other modules (may be null in serverless)
export { wsService };

export { app, server, io };
export default app;
