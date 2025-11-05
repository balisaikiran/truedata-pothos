/**
 * Vercel deploy entry handler, for serverless deployment
 * This file handles all API routes in serverless mode
 * IMPORTANT: This is the ONLY serverless function - all routes are handled by Express app
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app.js';

console.log('✅ Express app loaded successfully');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Adapt Vercel request/response to Express
  // Express app will handle all routes internally
  return new Promise<void>((resolve) => {
    app(req as any, res as any, () => {
      // If Express doesn't handle the request, resolve anyway
      if (!res.headersSent) {
        res.status(404).json({
          success: false,
          error: {
            code: '404',
            message: `Route ${req.method} ${req.url} not found`
          }
        });
      }
      resolve();
    });
  });
}
