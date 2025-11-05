import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import type { AuthResponse, User } from '../../shared/types.js';

const router = express.Router();

// Login endpoint
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Check if JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: JWT_SECRET missing'
      });
    }

    // Check if TRUEDATA_HISTORY_URL is set
    if (!process.env.TRUEDATA_HISTORY_URL) {
      console.error('TRUEDATA_HISTORY_URL is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: TRUEDATA_HISTORY_URL missing'
      });
    }
    
    // Authenticate with TrueData API
    const authResponse = await axios.post('https://auth.truedata.in/token', 
      `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&grant_type=password`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    const { access_token: trueDataToken } = authResponse.data;
    
    if (!trueDataToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Verify the token works by making a test API call
    try {
      const testResponse = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
        params: {
          symbols: 'RELIANCE',
          response: 'json'
        },
        headers: {
          'Authorization': `Bearer ${trueDataToken}`
        },
        timeout: 10000 // 10 second timeout
      });
      
      console.log('TrueData API test successful');
    } catch (apiError: any) {
      console.error('TrueData API test failed:', apiError.response?.data || apiError.message);
      return res.status(401).json({ 
        success: false, 
        message: 'TrueData API authentication failed' 
      });
    }

    // Generate JWT token for our application
    const token = jwt.sign(
      { 
        username,
        trueDataToken 
      },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      trueDataToken,
      user: {
        username
      }
    });

  } catch (error: any) {
    console.error('Authentication error:', error.response?.data || error.message);
    console.error('Error stack:', error.stack);
    
    // If it's an axios error, provide more details
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        message: error.response.data?.message || 'Authentication failed. Please check your credentials.'
      });
    }
    
    // If it's a network error
    if (error.request) {
      return res.status(503).json({
        success: false,
        message: 'Unable to connect to authentication service. Please try again later.'
      });
    }
    
    // Pass to Express error handler
    next(error);
  }
});

// Verify JWT token middleware
export const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      isAuthError: true
    });
  }

  jwt.verify(token, process.env.JWT_SECRET!, (err: any, user: any) => {
    if (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        isAuthError: true
      });
    }
    req.user = user;
    next();
  });
};

// Verify token endpoint
router.get('/verify', authenticateToken, (req: any, res) => {
  res.json({
    success: true,
    user: {
      username: req.user.username
    }
  });
});

// Logout endpoint
router.post('/logout', authenticateToken, (req, res) => {
  // In a real application, you might want to blacklist the token
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;