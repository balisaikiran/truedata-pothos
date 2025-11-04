/**
 * local server entry file, for local development
 */
import { app, initializeWebSocket } from './app.js';
import { createServer } from 'http';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

// Initialize WebSocket for local development
(async () => {
  await initializeWebSocket();
  
  // Get the server instance (initialized by initializeWebSocket)
  const { server } = await import('./app.js');
  
  if (!server) {
    console.error('❌ Server not initialized. Creating HTTP server...');
    const httpServer = createServer(app);
    httpServer.listen(PORT, () => {
      console.log(`🚀 TrueData Server running on port ${PORT}`);
      console.log(`⚠️  WebSocket not available`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    });
  } else {
    server.listen(PORT, () => {
      console.log(`🚀 TrueData Server running on port ${PORT}`);
      console.log(`📊 WebSocket server ready for real-time data`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  }
})();