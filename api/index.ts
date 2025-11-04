/**
 * Vercel deploy entry handler, for serverless deployment
 * This file handles all API routes in serverless mode
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';
import app from './app.js';

// Wrap Express app for serverless
const handler = serverless(app, {
  binary: ['image/*', 'application/json'],
});

console.log('✅ Express app loaded successfully');

export default async function (req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Request path:', req.url);
  console.log('Request method:', req.method);
  
  try {
    // Await the handler promise to ensure response is sent
    const result = await handler(req, res);
    console.log('Handler completed');
    return result;
  } catch (error: any) {
    console.error('Handler error:', error?.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: '500',
          message: error?.message || 'Internal server error'
        }
      });
    }
  }
}
