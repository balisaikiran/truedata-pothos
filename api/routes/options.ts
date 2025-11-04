import express from 'express';
import axios from 'axios';
import { authenticateToken } from './auth.js';
import type { OptionData, OptionsChainResponse } from '../../shared/types.js';

const router = express.Router();

// Helper: format expiry from yyyy-MM-dd to dd-MM-yyyy if needed
function formatExpiryParam(expiry?: string): string {
  if (!expiry) return '';
  const m = expiry.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [_, yyyy, mm, dd] = m;
    return `${dd}-${mm}-${yyyy}`;
  }
  return expiry;
}

// Test endpoint for debugging expiry dates
router.get('/test-expiry/:symbol', async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { expiry } = req.query as { expiry?: string };
    
    // Use the provided test token directly
    const trueDataToken = 'h-sG047Z_NJufa4XjyACSi6U37uPj78xBleUMnnf7wqy5-F7vwEBTlpAjwRZzOoWt6kGa8jzNBGU7qRV3-8GY6FXSDO-b5-qd1jvi7TeeAmygk0H2PRqtZnE6qdgYYnqd2PdRyFF0RwrOAT4ZlL1u0pSYUArRA7guoGSRWXnnn1iuvp9wN8lFtjhbPcNMe_kgPpk3y32c3ucB_Gr4omm5JZmF_JV4fRlYW067yqTqOEAzNfrJJNAKAEY04gZn28cFc-V8NPGBY48QUskRo69cg';

    const formattedExpiry = formatExpiryParam(expiry);
    console.log('Test endpoint - Original expiry:', expiry);
    console.log('Test endpoint - Formatted expiry:', formattedExpiry);

    // Build params; include expiry ONLY if provided
    const params: Record<string, any> = {
      symbol,
      response: 'json',
      segment: 'fo'
    };
    if (formattedExpiry) {
      params.expiry = formattedExpiry;
    }

    console.log('Test endpoint - API params:', params);

    // Call Analytics API
    const response = await axios.get(`https://analytics.truedata.in/api/getoptionchain`, {
      params,
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    console.log('Test endpoint - API response status:', response.status);
    console.log('Test endpoint - Records count:', response.data?.Records?.length || 0);

    res.json({
      success: true,
      originalExpiry: expiry,
      formattedExpiry: formattedExpiry,
      recordsCount: response.data?.Records?.length || 0,
      sampleRecord: response.data?.Records?.[0] || null
    });
  } catch (error: any) {
    console.error('Test endpoint error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// Get options chain for a symbol
router.get('/chain/:symbol', authenticateToken, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { expiry } = req.query as { expiry?: string };
    const { trueDataToken } = req.user;

    const formattedExpiry = formatExpiryParam(expiry);

    // Build params; include expiry ONLY if provided
    const params: Record<string, any> = {
      symbol,
      response: 'json',
      segment: 'fo'
    };
    if (formattedExpiry) {
      params.expiry = formattedExpiry;
    }

    // Call Analytics API (more reliable for options chain)
    const response = await axios.get(`https://analytics.truedata.in/api/getoptionchain`, {
      params,
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    let options: OptionData[] = [];
    let underlyingPrice = 0;
    let effectiveExpiry = formattedExpiry || '';

    const data = response.data;

    // Minimal logging to aid diagnosis (safe keys only)
    try {
      const keys = data && typeof data === 'object' ? Object.keys(data) : [];
      console.log('getoptionchain keys:', keys.join(','));
    } catch {}

    if (data) {
      if (Array.isArray(data.options)) {
        // Already shaped options array
        options = (data.options as any[]).map((item: any) => ({
          symbol: item.symbol || symbol,
          optionSymbol: item.optionSymbol || item.OptionSymbol || '',
          strike: parseFloat(item.strike || item.Strike || 0),
          series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
          expiry: item.expiry || item.Expiry || effectiveExpiry,
          ltp: parseFloat(item.ltp || item.LTP || 0),
          oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
          bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
          ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
          delta: parseFloat(item.delta || item.Delta || 0),
          gamma: parseFloat(item.gamma || item.Gamma || 0),
          theta: parseFloat(item.theta || item.Theta || 0),
          vega: parseFloat(item.vega || item.Vega || 0),
          timestamp: new Date().toISOString()
        }));
        underlyingPrice = parseFloat(data.underlyingPrice || 0);
        effectiveExpiry = data.expiry || effectiveExpiry;
      } else if (data.Records && (Array.isArray(data.Records) || typeof data.Records === 'object')) {
        // Safe debug: log record keys and object keys if applicable
        try {
          const recs = Array.isArray(data.Records) ? data.Records : Object.values(data.Records);
          const first = recs[0];
          const rKeys = first && typeof first === 'object' ? Object.keys(first) : [];
          console.log('getoptionchain first record keys:', rKeys.join(','));
          if (!first) {
            console.log('getoptionchain no first record or invalid type');
          }
          if (first && (first.CE || first.PE)) {
            console.log('getoptionchain nested CE/PE detected');
          }
          if (!Array.isArray(data.Records)) {
            const objKeys = Object.keys(data.Records as Record<string, any>);
            console.log('getoptionchain Records object keys:', objKeys.join(','));
          }
        } catch {}
        
        // Helper to determine option side from various fields
        const detectSide = (item: any): 'CE' | 'PE' | null => {
          const raw = (item?.series || item?.Series || item?.optionType || item?.OptionType || item?.type || item?.Type || '').toString().toUpperCase();
          if (!raw) return null;
          if (raw.includes('CE') || raw.includes('CALL') || raw === 'C') return 'CE';
          if (raw.includes('PE') || raw.includes('PUT') || raw === 'P') return 'PE';
          return null;
        };
        
        // Helper to normalize a single record which may be object or array
        const pushFromRecord = (rec: any, strikeHint?: number) => {
          const strikeRaw = rec?.strike || rec?.Strike || rec?.strikePrice || rec?.StrikePrice || rec?.Strike_Price || rec?.Strike_Price_Value || rec?.strike_price ||
                            rec?.CE?.strike || rec?.CE?.Strike || rec?.CE?.strikePrice || rec?.PE?.strike || rec?.PE?.Strike || rec?.PE?.strikePrice ||
                            (typeof strikeHint === 'number' ? strikeHint : 0);
          const strike = parseFloat(strikeRaw);

          const ceObj = rec?.CE || rec?.ce || null;
          const peObj = rec?.PE || rec?.pe || null;

          if (ceObj && typeof ceObj === 'object') {
            const ltpCE = parseFloat(ceObj.ltp || ceObj.LTP || ceObj.lastPrice || ceObj.LastPrice || ceObj.price || ceObj.Close || 0);
            options.push({
              symbol: symbol,
              optionSymbol: ceObj.optionSymbol || ceObj.symbol || ceObj.OptionSymbol || ceObj.TradingSymbol || '',
              strike,
              series: 'CE',
              expiry: ceObj.expiry || ceObj.Expiry || ceObj.ExpiryDate || effectiveExpiry || rec.expiry || rec.Expiry || '',
              ltp: ltpCE,
              oi: parseFloat(ceObj.oi || ceObj.OI || ceObj.openInterest || 0),
              bid: parseFloat(ceObj.bid || ceObj.Bid || ceObj.bidPrice || 0),
              ask: parseFloat(ceObj.ask || ceObj.Ask || ceObj.askPrice || 0),
              delta: parseFloat(ceObj.delta || ceObj.Delta || 0),
              gamma: parseFloat(ceObj.gamma || ceObj.Gamma || 0),
              theta: parseFloat(ceObj.theta || ceObj.Theta || 0),
              vega: parseFloat(ceObj.vega || ceObj.Vega || 0),
              timestamp: new Date().toISOString()
            });
          }
          if (peObj && typeof peObj === 'object') {
            const ltpPE = parseFloat(peObj.ltp || peObj.LTP || peObj.lastPrice || peObj.LastPrice || peObj.price || peObj.Close || 0);
            options.push({
              symbol: symbol,
              optionSymbol: peObj.optionSymbol || peObj.symbol || peObj.OptionSymbol || peObj.TradingSymbol || '',
              strike,
              series: 'PE',
              expiry: peObj.expiry || peObj.Expiry || peObj.ExpiryDate || effectiveExpiry || rec.expiry || rec.Expiry || '',
              ltp: ltpPE,
              oi: parseFloat(peObj.oi || peObj.OI || peObj.openInterest || 0),
              bid: parseFloat(peObj.bid || peObj.Bid || peObj.bidPrice || 0),
              ask: parseFloat(peObj.ask || peObj.Ask || peObj.askPrice || 0),
              delta: parseFloat(peObj.delta || peObj.Delta || 0),
              gamma: parseFloat(peObj.gamma || peObj.Gamma || 0),
              theta: parseFloat(peObj.theta || peObj.Theta || 0),
              vega: parseFloat(peObj.vega || peObj.Vega || 0),
              timestamp: new Date().toISOString()
            });
          }

          // NEW: handle flat single-option record (no nested CE/PE)
          if (!ceObj && !peObj && rec && typeof rec === 'object' && !Array.isArray(rec)) {
            const side = detectSide(rec);
            if (side) {
              const ltp = parseFloat(rec.ltp || rec.LTP || rec.lastPrice || rec.LastPrice || rec.price || rec.Close || 0);
              options.push({
                symbol: symbol,
                optionSymbol: rec.optionSymbol || rec.symbol || rec.OptionSymbol || rec.TradingSymbol || '',
                strike,
                series: side,
                expiry: rec.expiry || rec.Expiry || rec.ExpiryDate || effectiveExpiry || '',
                ltp,
                oi: parseFloat(rec.oi || rec.OI || rec.openInterest || 0),
                bid: parseFloat(rec.bid || rec.Bid || rec.bidPrice || 0),
                ask: parseFloat(rec.ask || rec.Ask || rec.askPrice || 0),
                delta: parseFloat(rec.delta || rec.Delta || 0),
                gamma: parseFloat(rec.gamma || rec.Gamma || 0),
                theta: parseFloat(rec.theta || rec.Theta || 0),
                vega: parseFloat(rec.vega || rec.Vega || 0),
                timestamp: new Date().toISOString()
              });
            }
          }

          if (!ceObj && !peObj && Array.isArray(rec)) {
            let ceItem = rec.find((x: any) => detectSide(x) === 'CE');
            let peItem = rec.find((x: any) => detectSide(x) === 'PE');
            // If not detected by fields, assume [CE, PE] ordering for length 2
            if ((!ceItem || !peItem) && rec.length >= 2) {
              ceItem = ceItem || rec[0];
              peItem = peItem || rec[1];
            }
            if (ceItem && typeof ceItem === 'object') {
              const ltpCE = parseFloat(ceItem.ltp || ceItem.LTP || ceItem.lastPrice || ceItem.LastPrice || ceItem.price || ceItem.Close || 0);
              options.push({
                symbol: symbol,
                optionSymbol: ceItem.optionSymbol || ceItem.symbol || ceItem.OptionSymbol || ceItem.TradingSymbol || '',
                strike,
                series: 'CE',
                expiry: ceItem.expiry || ceItem.Expiry || ceItem.ExpiryDate || effectiveExpiry || '',
                ltp: ltpCE,
                oi: parseFloat(ceItem.oi || ceItem.OI || ceItem.openInterest || 0),
                bid: parseFloat(ceItem.bid || ceItem.Bid || ceItem.bidPrice || 0),
                ask: parseFloat(ceItem.ask || ceItem.Ask || ceItem.askPrice || 0),
                delta: parseFloat(ceItem.delta || ceItem.Delta || 0),
                gamma: parseFloat(ceItem.gamma || ceItem.Gamma || 0),
                theta: parseFloat(ceItem.theta || ceItem.Theta || 0),
                vega: parseFloat(ceItem.vega || ceItem.Vega || 0),
                timestamp: new Date().toISOString()
              });
            }
            if (peItem && typeof peItem === 'object') {
              const ltpPE = parseFloat(peItem.ltp || peItem.LTP || peItem.lastPrice || peItem.LastPrice || peItem.price || peItem.Close || 0);
              options.push({
                symbol: symbol,
                optionSymbol: peItem.optionSymbol || peItem.symbol || peItem.OptionSymbol || peItem.TradingSymbol || '',
                strike,
                series: 'PE',
                expiry: peItem.expiry || peItem.Expiry || peItem.ExpiryDate || effectiveExpiry || '',
                ltp: ltpPE,
                oi: parseFloat(peItem.oi || peItem.OI || peItem.openInterest || 0),
                bid: parseFloat(peItem.bid || peItem.Bid || peItem.bidPrice || 0),
                ask: parseFloat(peItem.ask || peItem.Ask || peItem.askPrice || 0),
                delta: parseFloat(peItem.delta || peItem.Delta || 0),
                gamma: parseFloat(peItem.gamma || peItem.Gamma || 0),
                theta: parseFloat(peItem.theta || peItem.Theta || 0),
                vega: parseFloat(peItem.vega || peItem.Vega || 0),
                timestamp: new Date().toISOString()
              });
            }
          }
        };

        if (Array.isArray(data.Records)) {
          // Handle flat array format from TrueData Analytics API
          (data.Records as any[]).forEach((record: any) => {
            if (Array.isArray(record) && record.length >= 20) {
              // TrueData Analytics API returns flat arrays with specific indices
              // Format: [symbol, expiry, ?, strike, ceLtp, ceOI, ceBid, ceAsk, ceVol, ceOIChange, cePriceChange, peLtp, peOI, peBid, peAsk, peVol, peOIChange, pePriceChange, ?, ?, ?]
              const strike = record[3];
              const ceLtp = record[4];
              const peLtp = record[11];
              
              if (strike && strike !== null) {
                // Add CE option if LTP exists
                if (ceLtp && ceLtp !== null) {
                  options.push({
                    symbol: symbol,
                    optionSymbol: `${symbol}${strike}CE`,
                    strike: parseFloat(strike),
                    series: 'CE',
                    expiry: effectiveExpiry,
                    ltp: parseFloat(ceLtp),
                    oi: record[5] !== null && record[5] !== undefined ? parseFloat(record[5]) : 0, // ceOI at index 5
                    bid: record[6] !== null && record[6] !== undefined ? parseFloat(record[6]) : 0, // ceBid at index 6
                    ask: record[7] !== null && record[7] !== undefined ? parseFloat(record[7]) : 0, // ceAsk at index 7
                    delta: 0, // Greeks not available in this format
                    gamma: 0,
                    theta: 0,
                    vega: 0,
                    timestamp: new Date().toISOString()
                  });
                }
                
                // Add PE option if LTP exists
                if (peLtp && peLtp !== null) {
                  options.push({
                    symbol: symbol,
                    optionSymbol: `${symbol}${strike}PE`,
                    strike: parseFloat(strike),
                    series: 'PE',
                    expiry: effectiveExpiry,
                    ltp: parseFloat(peLtp),
                    oi: record[12] !== null && record[12] !== undefined ? parseFloat(record[12]) : 0, // peOI at index 12
                    bid: record[13] !== null && record[13] !== undefined ? parseFloat(record[13]) : 0, // peBid at index 13
                    ask: record[14] !== null && record[14] !== undefined ? parseFloat(record[14]) : 0, // peAsk at index 14
                    delta: 0, // Greeks not available in this format
                    gamma: 0,
                    theta: 0,
                    vega: 0,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            } else {
              // Fallback to original object-based parsing
              pushFromRecord(record);
            }
          });
        } else {
          Object.entries(data.Records as Record<string, any>).forEach(([key, rec]) => {
            const strikeFromKey = parseFloat(key);
            pushFromRecord(rec, strikeFromKey);
          });
        }
        
        console.log('getoptionchain mapped options count:', options.length);
        underlyingPrice = parseFloat(data.underlyingPrice || (data as any).UnderlyingPrice || 0);
        effectiveExpiry = (data as any).expiry || (data as any).Expiry || effectiveExpiry;
        } else if (Array.isArray(data)) {
        // Legacy array
        options = (data as any[]).map((item: any) => ({
          symbol: item.symbol || symbol,
          optionSymbol: item.optionSymbol || item.OptionSymbol || '',
          strike: parseFloat(item.strike || item.Strike || 0),
          series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
          expiry: item.expiry || item.Expiry || effectiveExpiry,
          ltp: parseFloat(item.ltp || item.LTP || 0),
          oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
          bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
          ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
          delta: parseFloat(item.delta || item.Delta || 0),
          gamma: parseFloat(item.gamma || item.Gamma || 0),
          theta: parseFloat(item.theta || item.Theta || 0),
          vega: parseFloat(item.vega || item.Vega || 0),
          timestamp: new Date().toISOString()
        }));
      }
    }

    // Fallback: if no options returned and an expiry was provided, try without expiry to get default/latest chain
    if ((!options || options.length === 0) && formattedExpiry) {
      try {
        const fallbackResp = await axios.get(`https://analytics.truedata.in/api/getoptionchain`, {
          params: {
            symbol,
            response: 'json',
            segment: 'fo'
          },
          headers: {
            'Authorization': `Bearer ${trueDataToken}`
          }
        });
        const fData = fallbackResp.data;
        if (fData) {
          if (Array.isArray(fData.options)) {
            options = (fData.options as any[]).map((item: any) => ({
              symbol: item.symbol || symbol,
              optionSymbol: item.optionSymbol || item.OptionSymbol || '',
              strike: parseFloat(item.strike || item.Strike || 0),
              series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
              expiry: item.expiry || item.Expiry || effectiveExpiry,
              ltp: parseFloat(item.ltp || item.LTP || 0),
              oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
              bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
              ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
              delta: parseFloat(item.delta || item.Delta || 0),
              gamma: parseFloat(item.gamma || item.Gamma || 0),
              theta: parseFloat(item.theta || item.Theta || 0),
              vega: parseFloat(item.vega || item.Vega || 0),
              timestamp: new Date().toISOString()
            }));
            underlyingPrice = parseFloat(fData.underlyingPrice || underlyingPrice || 0);
            effectiveExpiry = fData.expiry || effectiveExpiry;
          } else if (Array.isArray(fData.Records)) {
            // Safe debug: log first record keys
            try {
              const first = fData.Records[0];
              const rKeys = first && typeof first === 'object' ? Object.keys(first) : [];
              console.log('getoptionchain first record keys (fallback):', rKeys.join(','));
              if (first && (first.CE || first.PE)) {
                console.log('getoptionchain nested CE/PE detected (fallback)');
              }
              if (!Array.isArray(fData.Records)) {
                const objKeys = Object.keys(fData.Records as Record<string, any>);
                console.log('getoptionchain Records object keys (fallback):', objKeys.join(','));
              }
            } catch {}
            
            // Helper to normalize a single record in fallback
            const pushFallbackRecord = (rec: any, strikeHint?: number) => {
              const strikeRaw = rec?.strike || rec?.Strike || rec?.strikePrice || rec?.StrikePrice || rec?.Strike_Price || rec?.Strike_Price_Value || rec?.strike_price ||
                                rec?.CE?.strike || rec?.CE?.Strike || rec?.CE?.strikePrice || rec?.PE?.strike || rec?.PE?.Strike || rec?.PE?.strikePrice ||
                                (typeof strikeHint === 'number' ? strikeHint : 0);
              const strike = parseFloat(strikeRaw);

              const ceObj = rec?.CE || rec?.ce || null;
              const peObj = rec?.PE || rec?.pe || null;

              if (ceObj && typeof ceObj === 'object') {
                const ltpCE = parseFloat(ceObj.ltp || ceObj.LTP || ceObj.lastPrice || ceObj.LastPrice || ceObj.price || 0);
                options.push({
                  symbol: symbol,
                  optionSymbol: ceObj.optionSymbol || ceObj.symbol || '',
                  strike,
                  series: 'CE',
                  expiry: ceObj.expiry || effectiveExpiry || rec.expiry || rec.Expiry || '',
                  ltp: ltpCE,
                  oi: parseFloat(ceObj.oi || ceObj.OI || ceObj.openInterest || 0),
                  bid: parseFloat(ceObj.bid || ceObj.Bid || ceObj.bidPrice || 0),
                  ask: parseFloat(ceObj.ask || ceObj.Ask || ceObj.askPrice || 0),
                  delta: parseFloat(ceObj.delta || ceObj.Delta || 0),
                  gamma: parseFloat(ceObj.gamma || ceObj.Gamma || 0),
                  theta: parseFloat(ceObj.theta || ceObj.Theta || 0),
                  vega: parseFloat(ceObj.vega || ceObj.Vega || 0),
                  timestamp: new Date().toISOString()
                });
              }
              if (peObj && typeof peObj === 'object') {
                const ltpPE = parseFloat(peObj.ltp || peObj.LTP || peObj.lastPrice || peObj.LastPrice || peObj.price || 0);
                options.push({
                  symbol: symbol,
                  optionSymbol: peObj.optionSymbol || peObj.symbol || '',
                  strike,
                  series: 'PE',
                  expiry: peObj.expiry || effectiveExpiry || rec.expiry || rec.Expiry || '',
                  ltp: ltpPE,
                  oi: parseFloat(peObj.oi || peObj.OI || peObj.openInterest || 0),
                  bid: parseFloat(peObj.bid || peObj.Bid || peObj.bidPrice || 0),
                  ask: parseFloat(peObj.ask || peObj.Ask || peObj.askPrice || 0),
                  delta: parseFloat(peObj.delta || peObj.Delta || 0),
                  gamma: parseFloat(peObj.gamma || peObj.Gamma || 0),
                  theta: parseFloat(peObj.theta || peObj.Theta || 0),
                  vega: parseFloat(peObj.vega || peObj.Vega || 0),
                  timestamp: new Date().toISOString()
                });
              }

              if (!ceObj && !peObj && Array.isArray(rec)) {
                let ceItem = rec.find((x: any) => {
                  const raw = (x?.series || x?.Series || x?.optionType || x?.OptionType || x?.type || x?.Type || '').toString().toUpperCase();
                  return raw.includes('CE') || raw.includes('CALL') || raw === 'C';
                });
                let peItem = rec.find((x: any) => {
                  const raw = (x?.series || x?.Series || x?.optionType || x?.OptionType || x?.type || x?.Type || '').toString().toUpperCase();
                  return raw.includes('PE') || raw.includes('PUT') || raw === 'P';
                });
                if ((!ceItem || !peItem) && rec.length >= 2) {
                  ceItem = ceItem || rec[0];
                  peItem = peItem || rec[1];
                }
                if (ceItem && typeof ceItem === 'object') {
                  const ltpCE = parseFloat(ceItem.ltp || ceItem.LTP || ceItem.lastPrice || ceItem.LastPrice || ceItem.price || ceItem.Close || 0);
                  options.push({
                    symbol: symbol,
                    optionSymbol: ceItem.optionSymbol || ceItem.symbol || ceItem.OptionSymbol || ceItem.TradingSymbol || '',
                    strike,
                    series: 'CE',
                    expiry: ceItem.expiry || ceItem.Expiry || ceItem.ExpiryDate || effectiveExpiry || '',
                    ltp: ltpCE,
                    oi: parseFloat(ceItem.oi || ceItem.OI || ceItem.openInterest || 0),
                    bid: parseFloat(ceItem.bid || ceItem.Bid || ceItem.bidPrice || 0),
                    ask: parseFloat(ceItem.ask || ceItem.Ask || ceItem.askPrice || 0),
                    delta: parseFloat(ceItem.delta || ceItem.Delta || 0),
                    gamma: parseFloat(ceItem.gamma || ceItem.Gamma || 0),
                    theta: parseFloat(ceItem.theta || ceItem.Theta || 0),
                    vega: parseFloat(ceItem.vega || ceItem.Vega || 0),
                    timestamp: new Date().toISOString()
                  });
                }
                if (peItem && typeof peItem === 'object') {
                  const ltpPE = parseFloat(peItem.ltp || peItem.LTP || peItem.lastPrice || peItem.LastPrice || peItem.price || peItem.Close || 0);
                  options.push({
                    symbol: symbol,
                    optionSymbol: peItem.optionSymbol || peItem.symbol || peItem.OptionSymbol || peItem.TradingSymbol || '',
                    strike,
                    series: 'PE',
                    expiry: peItem.expiry || peItem.Expiry || peItem.ExpiryDate || effectiveExpiry || '',
                    ltp: ltpPE,
                    oi: parseFloat(peItem.oi || peItem.OI || peItem.openInterest || 0),
                    bid: parseFloat(peItem.bid || peItem.Bid || peItem.bidPrice || 0),
                    ask: parseFloat(peItem.ask || peItem.Ask || peItem.askPrice || 0),
                    delta: parseFloat(peItem.delta || peItem.Delta || 0),
                    gamma: parseFloat(peItem.gamma || peItem.Gamma || 0),
                    theta: parseFloat(peItem.theta || peItem.Theta || 0),
                    vega: parseFloat(peItem.vega || peItem.Vega || 0),
                    timestamp: new Date().toISOString()
                  });
                }
              }
            };

            if (Array.isArray(fData.Records)) {
              // Handle flat array format from TrueData Analytics API
              (fData.Records as any[]).forEach((record: any) => {
                if (Array.isArray(record) && record.length >= 20) {
                  // TrueData Analytics API returns flat arrays with specific indices
                  const strike = record[3];
                  const ceLtp = record[4];
                  const peLtp = record[11];
                  
                  if (strike && strike !== null) {
                    // Add CE option if LTP exists
                    if (ceLtp && ceLtp !== null) {
                      options.push({
                        symbol: symbol,
                        optionSymbol: `${symbol}${strike}CE`,
                        strike: parseFloat(strike),
                        series: 'CE',
                        expiry: effectiveExpiry,
                        ltp: parseFloat(ceLtp),
                        oi: record[5] !== null && record[5] !== undefined ? parseFloat(record[5]) : 0, // ceOI at index 5
                        bid: record[6] !== null && record[6] !== undefined ? parseFloat(record[6]) : 0, // ceBid at index 6
                        ask: record[7] !== null && record[7] !== undefined ? parseFloat(record[7]) : 0, // ceAsk at index 7
                        delta: 0, // Greeks not available in this format
                        gamma: 0,
                        theta: 0,
                        vega: 0,
                        timestamp: new Date().toISOString()
                      });
                    }
                    
                    // Add PE option if LTP exists
                    if (peLtp && peLtp !== null) {
                      options.push({
                        symbol: symbol,
                        optionSymbol: `${symbol}${strike}PE`,
                        strike: parseFloat(strike),
                        series: 'PE',
                        expiry: effectiveExpiry,
                        ltp: parseFloat(peLtp),
                        oi: record[12] !== null && record[12] !== undefined ? parseFloat(record[12]) : 0, // peOI at index 12
                        bid: record[13] !== null && record[13] !== undefined ? parseFloat(record[13]) : 0, // peBid at index 13
                        ask: record[14] !== null && record[14] !== undefined ? parseFloat(record[14]) : 0, // peAsk at index 14
                        delta: 0, // Greeks not available in this format
                        gamma: 0,
                        theta: 0,
                        vega: 0,
                        timestamp: new Date().toISOString()
                      });
                    }
                  }
                } else {
                  // Fallback to original object-based parsing
                  pushFallbackRecord(record);
                }
              });
            } else {
              Object.entries(fData.Records as Record<string, any>).forEach(([key, rec]) => {
                const strikeFromKey = parseFloat(key);
                pushFallbackRecord(rec, strikeFromKey);
              });
            }
            
            console.log('getoptionchain mapped options count (fallback):', options.length);
            underlyingPrice = parseFloat(fData.underlyingPrice || underlyingPrice || 0);
            effectiveExpiry = fData.expiry || effectiveExpiry;
          } else if (Array.isArray(fData)) {
            options = (fData as any[]).map((item: any) => ({
              symbol: item.symbol || symbol,
              optionSymbol: item.optionSymbol || item.OptionSymbol || '',
              strike: parseFloat(item.strike || item.Strike || 0),
              series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
              expiry: item.expiry || item.Expiry || effectiveExpiry,
              ltp: parseFloat(item.ltp || item.LTP || 0),
              oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
              bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
              ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
              delta: parseFloat(item.delta || item.Delta || 0),
              gamma: parseFloat(item.gamma || item.Gamma || 0),
              theta: parseFloat(item.theta || item.Theta || 0),
              vega: parseFloat(item.vega || item.Vega || 0),
              timestamp: new Date().toISOString()
            }));
          }
        }
      } catch (fallbackErr) {
        console.warn('Fallback options chain fetch without expiry failed:', (fallbackErr as any).message);
      }

      // Secondary fallback: try REST API with user/password
      if (!options || options.length === 0) {
        try {
          const username = process.env.TRUEDATA_USERNAME;
          const password = process.env.TRUEDATA_PASSWORD;
          // Helper to format expiry to YYYYMMDD
          const toYYYYMMDD = (dmy: string) => {
            const m = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
            if (m) {
              const [_, dd, mm, yyyy] = m;
              return `${yyyy}${mm}${dd}`;
            }
            return dmy;
          };
          const expiryYYYYMMDD = formattedExpiry ? toYYYYMMDD(formattedExpiry) : '';

          const restParams1: Record<string, any> = {
            symbol,
            response: 'json',
            user: username,
            password: password,
          };
          if (formattedExpiry) restParams1.expiry = formattedExpiry;

          const restResp1 = await axios.get(`https://api.truedata.in/getoptionchain`, { params: restParams1 });
          let restData = restResp1.data;

          // If still empty and we have YYYYMMDD, try that format
          if ((!restData || (!Array.isArray(restData.options) && !Array.isArray(restData.Records) && !Array.isArray(restData))) && expiryYYYYMMDD) {
            const restParams2 = { ...restParams1, expiry: expiryYYYYMMDD };
            const restResp2 = await axios.get(`https://api.truedata.in/getoptionchain`, { params: restParams2 });
            restData = restResp2.data;
          }

          if (restData) {
            if (Array.isArray(restData.options)) {
              options = (restData.options as any[]).map((item: any) => ({
                symbol: item.symbol || symbol,
                optionSymbol: item.optionSymbol || item.OptionSymbol || '',
                strike: parseFloat(item.strike || item.Strike || 0),
                series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
                expiry: item.expiry || item.Expiry || effectiveExpiry,
                ltp: parseFloat(item.ltp || item.LTP || 0),
                oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
                bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
                ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
                delta: parseFloat(item.delta || item.Delta || 0),
                gamma: parseFloat(item.gamma || item.Gamma || 0),
                theta: parseFloat(item.theta || item.Theta || 0),
                vega: parseFloat(item.vega || item.Vega || 0),
                timestamp: new Date().toISOString()
              }));
              underlyingPrice = parseFloat(restData.underlyingPrice || underlyingPrice || 0);
              effectiveExpiry = restData.expiry || effectiveExpiry;
            } else if (restData.Records && (Array.isArray(restData.Records) || typeof restData.Records === 'object')) {
              const recordsArray: any[] = Array.isArray(restData.Records) ? (restData.Records as any[]) : Object.values(restData.Records as Record<string, any>);
              recordsArray.forEach((rec: any) => {
                const strikeRaw = rec.strike || rec.Strike || rec.strikePrice || rec.StrikePrice || rec.Strike_Price || rec.Strike_Price_Value || rec.strike_price || 0;
                const strike = parseFloat(strikeRaw);
                const ce = rec.CE || rec.ce || null;
                const pe = rec.PE || rec.pe || null;
                if (ce && typeof ce === 'object') {
                  const ltpCE = parseFloat(ce.ltp || ce.LTP || ce.lastPrice || ce.LastPrice || ce.price || 0);
                  options.push({
                    symbol: symbol,
                    optionSymbol: ce.optionSymbol || ce.symbol || '',
                    strike,
                    series: 'CE',
                    expiry: ce.expiry || effectiveExpiry || rec.expiry || rec.Expiry || '',
                    ltp: ltpCE,
                    oi: parseFloat(ce.oi || ce.OI || ce.openInterest || 0),
                    bid: parseFloat(ce.bid || ce.Bid || ce.bidPrice || 0),
                    ask: parseFloat(ce.ask || ce.Ask || ce.askPrice || 0),
                    delta: parseFloat(ce.delta || ce.Delta || 0),
                    gamma: parseFloat(ce.gamma || ce.Gamma || 0),
                    theta: parseFloat(ce.theta || ce.Theta || 0),
                    vega: parseFloat(ce.vega || ce.Vega || 0),
                    timestamp: new Date().toISOString()
                  });
                }
                if (pe && typeof pe === 'object') {
                  const ltpPE = parseFloat(pe.ltp || pe.LTP || pe.lastPrice || pe.LastPrice || pe.price || 0);
                  options.push({
                    symbol: symbol,
                    optionSymbol: pe.optionSymbol || pe.symbol || '',
                    strike,
                    series: 'PE',
                    expiry: pe.expiry || effectiveExpiry || rec.expiry || rec.Expiry || '',
                    ltp: ltpPE,
                    oi: parseFloat(pe.oi || pe.OI || pe.openInterest || 0),
                    bid: parseFloat(pe.bid || pe.Bid || pe.bidPrice || 0),
                    ask: parseFloat(pe.ask || pe.Ask || pe.askPrice || 0),
                    delta: parseFloat(pe.delta || pe.Delta || 0),
                    gamma: parseFloat(pe.gamma || pe.Gamma || 0),
                    theta: parseFloat(pe.theta || pe.Theta || 0),
                    vega: parseFloat(pe.vega || pe.Vega || 0),
                    timestamp: new Date().toISOString()
                  });
                }
              });
              underlyingPrice = parseFloat(restData.underlyingPrice || underlyingPrice || (restData as any).UnderlyingPrice || 0);
              effectiveExpiry = (restData as any).expiry || (restData as any).Expiry || effectiveExpiry;
            } else if (Array.isArray(restData)) {
              options = (restData as any[]).map((item: any) => ({
                symbol: item.symbol || symbol,
                optionSymbol: item.optionSymbol || item.OptionSymbol || '',
                strike: parseFloat(item.strike || item.Strike || 0),
                series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
                expiry: item.expiry || item.Expiry || effectiveExpiry,
                ltp: parseFloat(item.ltp || item.LTP || 0),
                oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
                bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
                ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
                delta: parseFloat(item.delta || item.Delta || 0),
                gamma: parseFloat(item.gamma || item.Gamma || 0),
                theta: parseFloat(item.theta || item.Theta || 0),
                vega: parseFloat(item.vega || item.Vega || 0),
                timestamp: new Date().toISOString()
              }));
            }
          }
        } catch (restErr) {
          console.warn('Secondary REST options chain fetch failed:', (restErr as any).message);
        }
      }
    }

    // Fetch underlying price using history getLTPBulk (JSON reliable)
    try {
      const ltpResponse = await axios.get(`${process.env.TRUEDATA_HISTORY_URL}/getLTPBulk`, {
        params: {
          symbols: symbol,
          response: 'json'
        },
        headers: {
          'Authorization': `Bearer ${trueDataToken}`
        }
      });

      const ltpData = ltpResponse.data;
      if (ltpData && ltpData.status === 'Success' && Array.isArray(ltpData.Records) && ltpData.Records.length > 0) {
        const record = ltpData.Records[0];
        // TrueData getLTPBulk returns: [symbolId, timestamp, price, volume, change]
        underlyingPrice = parseFloat(record[2] || 0);
      }
    } catch (ltpError) {
      console.warn('Failed to fetch underlying price:', (ltpError as any).message);
    }

    const chainResponse: OptionsChainResponse = {
      options,
      underlyingPrice,
      expiry: effectiveExpiry
    };

    // Help avoid stale 304s during dev
    res.setHeader('Cache-Control', 'no-store');
    res.json(chainResponse);
  } catch (error: any) {
    console.error('Options chain fetch error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch options chain'
    });
  }
});

// Get options chain with Greeks
router.get('/greeks/:symbol', authenticateToken, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { expiry, strike, series } = req.query;
    const { trueDataToken } = req.user;

    const response = await axios.get(`${process.env.TRUEDATA_API_URL}/getOptionChainwithGreeks`, {
      params: {
        symbol,
        expiry: expiry || '',
        strike: strike || '',
        series: series || '',
        response: 'json'
      },
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const options: OptionData[] = response.data.map((item: any) => ({
        symbol: item.symbol || symbol,
        optionSymbol: item.optionSymbol || item.OptionSymbol || '',
        strike: parseFloat(item.strike || item.Strike || 0),
        series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
        expiry: item.expiry || item.Expiry || '',
        ltp: parseFloat(item.ltp || item.LTP || 0),
        oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
        bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
        ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
        delta: parseFloat(item.delta || item.Delta || 0),
        gamma: parseFloat(item.gamma || item.Gamma || 0),
        theta: parseFloat(item.theta || item.Theta || 0),
        vega: parseFloat(item.vega || item.Vega || 0),
        timestamp: new Date().toISOString()
      }));

      res.json({
        options,
        total: options.length
      });
    } else {
      res.json({
        options: [],
        total: 0
      });
    }
  } catch (error: any) {
    console.error('Options Greeks fetch error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch options with Greeks'
    });
  }
});

// Get LTP with Greeks for specific option
router.get('/ltp/:symbol', authenticateToken, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    const { expiry, strike, series } = req.query;
    const { trueDataToken } = req.user;

    const response = await axios.get(`${process.env.TRUEDATA_API_URL}/getLTPwithGreeks`, {
      params: {
        symbol,
        expiry: expiry || '',
        strike: strike || '',
        series: series || '',
        response: 'json'
      },
      headers: {
        'Authorization': `Bearer ${trueDataToken}`
      }
    });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const item = response.data[0];
      const optionData: OptionData = {
        symbol: item.symbol || symbol,
        optionSymbol: item.optionSymbol || item.OptionSymbol || '',
        strike: parseFloat(item.strike || item.Strike || 0),
        series: (item.series || item.Series || 'CE').toUpperCase() as 'CE' | 'PE',
        expiry: item.expiry || item.Expiry || '',
        ltp: parseFloat(item.ltp || item.LTP || 0),
        oi: parseFloat(item.oi || item.OI || item.openInterest || 0),
        bid: parseFloat(item.bid || item.Bid || item.bidPrice || 0),
        ask: parseFloat(item.ask || item.Ask || item.askPrice || 0),
        delta: parseFloat(item.delta || item.Delta || 0),
        gamma: parseFloat(item.gamma || item.Gamma || 0),
        theta: parseFloat(item.theta || item.Theta || 0),
        vega: parseFloat(item.vega || item.Vega || 0),
        timestamp: new Date().toISOString()
      };

      res.json(optionData);
    } else {
      res.status(404).json({
        success: false,
        message: 'Option data not found'
      });
    }
  } catch (error: any) {
    console.error('Option LTP with Greeks fetch error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch option LTP with Greeks'
    });
  }
});

export default router;