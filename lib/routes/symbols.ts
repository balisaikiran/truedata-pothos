import express from 'express';
import axios from 'axios';
import { authenticateToken } from './auth.js';
import type { Symbol, SymbolSearchResponse } from '../../shared/types.js';

const router = express.Router();

// Search symbols
router.get('/search', authenticateToken, async (req: any, res) => {
  try {
    const { query, segment = 'eq', limit = 50 } = req.query;
    const { trueDataToken } = req.user;

    const response = await axios.get(`${process.env.TRUEDATA_API_URL}/getAllSymbols`, {
      params: {
        segment: segment === 'eq' ? 'eq' : segment,
        user: process.env.TRUEDATA_USERNAME,
        password: process.env.TRUEDATA_PASSWORD,
        token: 'true',
        companyname: 'true',
        isin: 'true',
        ticksize: 'true',
        limit: limit,
        search: query || ''
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const symbols: Symbol[] = response.data
        .slice(0, parseInt(limit as string))
        .map((item: any) => ({
          symbol: item.symbol || item.Symbol,
          companyName: item.companyName || item.CompanyName || item.symbol,
          segment: (item.segment || item.Segment || 'EQ').toUpperCase() as 'EQ' | 'FO' | 'MCX',
          isin: item.isin || item.ISIN || '',
          tickSize: parseFloat(item.tickSize || item.TickSize || 0.05),
          lotSize: parseInt(item.lotSize || item.LotSize || 1),
          isActive: item.isActive !== false
        }));

      const searchResponse: SymbolSearchResponse = {
        symbols,
        total: symbols.length
      };

      res.json(searchResponse);
    } else {
      res.json({
        symbols: [],
        total: 0
      });
    }
  } catch (error: any) {
    console.error('Symbol search error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to search symbols'
    });
  }
});

// Get all symbols for a segment
router.get('/all', authenticateToken, async (req: any, res) => {
  try {
    const { segment = 'eq' } = req.query;
    const { trueDataToken } = req.user;

    const response = await axios.get(`${process.env.TRUEDATA_API_URL}/getAllSymbols`, {
      params: {
        segment: segment === 'eq' ? 'eq' : segment,
        user: process.env.TRUEDATA_USERNAME,
        password: process.env.TRUEDATA_PASSWORD,
        token: 'true',
        companyname: 'true',
        isin: 'true',
        ticksize: 'true'
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const symbols: Symbol[] = response.data.map((item: any) => ({
        symbol: item.symbol || item.Symbol,
        companyName: item.companyName || item.CompanyName || item.symbol,
        segment: (item.segment || item.Segment || 'EQ').toUpperCase() as 'EQ' | 'FO' | 'MCX',
        isin: item.isin || item.ISIN || '',
        tickSize: parseFloat(item.tickSize || item.TickSize || 0.05),
        lotSize: parseInt(item.lotSize || item.LotSize || 1),
        isActive: item.isActive !== false
      }));

      const searchResponse: SymbolSearchResponse = {
        symbols,
        total: symbols.length
      };

      res.json(searchResponse);
    } else {
      res.json({
        symbols: [],
        total: 0
      });
    }
  } catch (error: any) {
    console.error('Get all symbols error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch symbols'
    });
  }
});

// Get symbol details
router.get('/details/:symbol', authenticateToken, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { segment = 'eq' } = req.query;
    const { trueDataToken } = req.user;

    const response = await axios.get(`${process.env.TRUEDATA_API_URL}/getAllSymbols`, {
      params: {
        segment: segment === 'eq' ? 'eq' : segment,
        user: process.env.TRUEDATA_USERNAME,
        password: process.env.TRUEDATA_PASSWORD,
        token: 'true',
        companyname: 'true',
        isin: 'true',
        ticksize: 'true',
        search: symbol
      }
    });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const item = response.data.find((s: any) => 
        (s.symbol || s.Symbol) === symbol
      ) || response.data[0];

      const symbolDetails: Symbol = {
        symbol: item.symbol || item.Symbol,
        companyName: item.companyName || item.CompanyName || item.symbol,
        segment: (item.segment || item.Segment || 'EQ').toUpperCase() as 'EQ' | 'FO' | 'MCX',
        isin: item.isin || item.ISIN || '',
        tickSize: parseFloat(item.tickSize || item.TickSize || 0.05),
        lotSize: parseInt(item.lotSize || item.LotSize || 1),
        isActive: item.isActive !== false
      };

      res.json(symbolDetails);
    } else {
      res.status(404).json({
        success: false,
        message: 'Symbol not found'
      });
    }
  } catch (error: any) {
    console.error('Symbol details error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch symbol details'
    });
  }
});

export default router;