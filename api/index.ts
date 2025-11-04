/**
 * Vercel deploy entry handler, for serverless deployment
 * This file handles all API routes in serverless mode
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app.js';

console.log('✅ Express app loaded successfully');

export default function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Use Express app directly - it should handle Vercel request/response
  // Express's request/response objects are compatible with Node's http module
  return app(req as any, res as any);
}
