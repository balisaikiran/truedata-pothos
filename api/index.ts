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

export default function (req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Request path:', req.url);
  console.log('Request method:', req.method);
  
  // Call handler directly (serverless-http handles async internally)
  return handler(req, res);
}
