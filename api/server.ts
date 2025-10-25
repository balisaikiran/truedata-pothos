/**
 * local server entry file, for local development
 */
import { server } from './app';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 TrueData Server running on port ${PORT}`);
  console.log(`📊 WebSocket server ready for real-time data`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

/**
 * close server
 */
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

export default server;