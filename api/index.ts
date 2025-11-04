/**
 * Vercel deploy entry handler, for serverless deployment
 * This file handles all API routes in serverless mode
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';

// Lazy load app to catch initialization errors
let handler: any = null;

async function getHandler() {
  if (handler) return handler;
  
  try {
    console.log('Loading Express app...');
    const appModule = await import('./app.js');
    const app = appModule.default;
    
    handler = serverless(app, {
      binary: ['image/*', 'application/json'],
    });
    
    console.log('✅ Express app loaded successfully');
    return handler;
  } catch (error: any) {
    console.error('❌ Failed to load Express app:', error);
    console.error('❌ Error stack:', error?.stack);
    throw error;
  }
}

export default async function (req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  try {
    const appHandler = await getHandler();
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 25000); // 25 second timeout
    });
    
    // Race between handler and timeout
    return Promise.race([
      appHandler(req, res),
      timeoutPromise
    ]).catch((error: any) => {
      console.error('❌ Handler error:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: '500',
            message: error?.message || 'A server error has occurred'
          }
        });
      }
    });
  } catch (error: any) {
    console.error('❌ Failed to get handler:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: '500',
          message: 'Failed to initialize server'
        }
      });
    }
  }
}
