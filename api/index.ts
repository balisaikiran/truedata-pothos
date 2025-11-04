/**
 * Vercel deploy entry handler, for serverless deployment
 * This file handles all API routes in serverless mode
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';

// Import app with error handling
let app: any;
let handler: any;

try {
  app = require('./app.js').default;
  // Wrap Express app for serverless
  handler = serverless(app, {
    binary: ['image/*', 'application/json'],
  });
  console.log('✅ Express app loaded successfully');
} catch (error: any) {
  console.error('❌ Failed to load Express app:', error);
  console.error('❌ Error stack:', error?.stack);
}

export default async function (req: VercelRequest, res: VercelResponse) {
  // Check if app loaded successfully
  if (!app || !handler) {
    console.error('❌ Express app not loaded, cannot handle request');
    return res.status(500).json({
      success: false,
      error: {
        code: '500',
        message: 'Server initialization failed'
      }
    });
  }

  // Debug logging
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Environment check:', {
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasTrueDataApi: !!process.env.TRUEDATA_API_URL,
    hasTrueDataHistory: !!process.env.TRUEDATA_HISTORY_URL,
    isVercel: !!process.env.VERCEL,
    nodeEnv: process.env.NODE_ENV
  });

  try {
    // Set CORS headers for Vercel
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Handle the request using serverless-wrapped Express app
    const result = await handler(req, res);
    return result;
  } catch (error: any) {
    // Log error for debugging
    console.error('❌ Serverless handler error:', error);
    console.error('❌ Error name:', error?.name);
    console.error('❌ Error message:', error?.message);
    console.error('❌ Error stack:', error?.stack);
    
    // Return proper error response
    if (!res.headersSent) {
      const errorMessage = error?.message || 'A server error has occurred';
      console.error('❌ Sending error response:', errorMessage);
      
      res.status(500).json({
        success: false,
        error: {
          code: '500',
          message: errorMessage,
          ...(process.env.NODE_ENV === 'development' && { 
            stack: error?.stack,
            details: error?.toString()
          })
        }
      });
    } else {
      console.error('❌ Headers already sent, cannot send error response');
    }
  }
}