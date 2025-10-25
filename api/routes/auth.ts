import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import type { AuthResponse, User } from '../../shared/types';

const router = express.Router();

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }
    
    // Authenticate with TrueData API
    const authResponse = await axios.post('https://auth.truedata.in/token', 
      `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&grant_type=password`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
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
        }
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
    res.status(401).json({
      success: false,
      message: 'Authentication failed. Please check your credentials.'
    });
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