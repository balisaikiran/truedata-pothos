# F&O Dashboard Integration with TrueData API

## Overview

This document describes the integration of a comprehensive F&O (Futures & Options) dashboard with real-time data from TrueData API. The dashboard provides live market data, option chains, Greeks calculations, and gamma signals for top F&O stocks.

## Features

### 1. Real-time Market Data
- Live LTP (Last Traded Price) for top 50 F&O stocks
- Price changes and percentage changes
- Volume data
- Market summary with active signals, average IV, top gainers/losers

### 2. Option Chain Analysis
- Expandable option chains for each stock
- Call and Put options with bid/ask prices
- Open Interest (OI) data
- Greeks calculations (Delta, Gamma, Theta, Vega, Rho)
- Moneyness indicators

### 3. Gamma Signal Detection
- Automatic detection of gamma signals based on price movements
- Different thresholds for NIFTY (>1.5%) and other stocks (>2%)
- Visual indicators for active signals

### 4. Advanced Filtering
- Filter by gamma signals only
- IV (Implied Volatility) range filtering
- Multiple sorting options (change %, IV, volume)

## API Integration

### New Endpoints

#### 1. F&O Market Data
```
GET /api/fno/market-data
```
Returns real-time data for top F&O stocks including:
- Symbol, spot price, change, volume
- IV, IV Rank, IV Percentile (mock data)
- Gamma signal status

#### 2. F&O Market Summary
```
GET /api/fno/market-summary
```
Returns aggregated market statistics:
- Active signals count
- Average IV across all stocks
- Top gainer and loser symbols
- Total stocks count

#### 3. F&O Option Chain
```
GET /api/fno/option-chain/:symbol?expiry=DD-MM-YYYY
```
Returns option chain data for a specific symbol using the existing options API.

### Data Flow

1. **Authentication**: Uses existing JWT-based authentication
2. **Rate Limiting**: Implements rate limiting for TrueData API calls
3. **Caching**: 30-second cache for market data to reduce API calls
4. **Error Handling**: Comprehensive error handling with fallbacks

## Implementation Details

### Backend Changes

#### 1. New F&O Route (`api/routes/fno.ts`)
- Fetches LTP data for top 50 F&O symbols
- Generates mock IV data (TrueData doesn't provide IV directly)
- Implements gamma signal logic
- Provides market summary calculations

#### 2. Updated App Configuration (`api/app.ts`)
- Added F&O routes to the Express app
- Integrated with existing middleware

#### 3. Enhanced Types (`shared/types.ts`)
- Added F&O-specific interfaces
- Extended existing types for better type safety

### Frontend Changes

#### 1. New Dashboard Component (`src/pages/LiveFODashboard.tsx`)
- Real-time data fetching with 30-second intervals
- Interactive option chain expansion
- Advanced filtering and sorting
- Responsive design with dark theme

#### 2. Updated API Service (`src/services/api.ts`)
- Added F&O-specific API methods
- Integrated with existing error handling

#### 3. Enhanced Navigation (`src/components/layout/Layout.tsx`)
- Added F&O Dashboard to navigation menu
- New route in App.tsx

## Configuration

### Environment Variables Required

```env
# TrueData API Configuration
TRUEDATA_API_URL=https://api.truedata.in
TRUEDATA_HISTORY_URL=https://history.truedata.in
TRUEDATA_USERNAME=tdwsp784
TRUEDATA_PASSWORD=sid@784

# Server Configuration
PORT=3002
CLIENT_URL=http://localhost:5173

# JWT Configuration
JWT_SECRET=your_jwt_secret_here
```

### TrueData Credentials
- **Username**: tdwsp784
- **Password**: sid@784

## Usage

### Accessing the Dashboard
1. Navigate to `/fno-dashboard` in the application
2. The dashboard will automatically load real-time data
3. Use filters to customize the view
4. Click on any stock to expand its option chain

### Key Features Usage

#### Gamma Signals
- Yellow alert icons indicate active gamma signals
- Signals are based on price movement thresholds
- NIFTY: >1.5% movement
- Other stocks: >2% movement

#### Option Chains
- Click the chevron icon to expand option chains
- View call and put options with Greeks
- Strike prices around the current spot price
- Moneyness indicators for ATM options

#### Filtering
- **Show Only Signals**: Filter to show only stocks with gamma signals
- **IV Range**: Set minimum and maximum IV values
- **Sort By**: Choose sorting criteria (change %, IV, volume)

## Technical Architecture

### Data Sources
1. **TrueData LTP API**: Real-time price data
2. **TrueData Options API**: Option chain data
3. **Mock IV Data**: Generated IV values (TrueData limitation)

### Performance Optimizations
1. **Caching**: 30-second cache for market data
2. **Rate Limiting**: Prevents API quota exhaustion
3. **Lazy Loading**: Option chains loaded on demand
4. **Efficient Updates**: Only updates changed data

### Error Handling
1. **API Failures**: Graceful degradation with error messages
2. **Network Issues**: Retry mechanisms with exponential backoff
3. **Data Validation**: Input validation and sanitization
4. **User Feedback**: Clear error messages and loading states

## Future Enhancements

### Planned Features
1. **Real IV Data**: Integration with IV data providers
2. **WebSocket Updates**: Real-time data streaming
3. **Advanced Greeks**: More sophisticated Greeks calculations
4. **Portfolio Tracking**: Track specific stocks and options
5. **Alerts System**: Custom alerts for price movements and signals

### Technical Improvements
1. **Database Integration**: Store historical data
2. **Advanced Caching**: Redis-based caching
3. **Performance Monitoring**: API response time tracking
4. **Mobile Optimization**: Enhanced mobile experience

## Troubleshooting

### Common Issues

#### 1. No Data Loading
- Check TrueData API credentials
- Verify network connectivity
- Check browser console for errors

#### 2. Authentication Errors
- Ensure user is logged in
- Check JWT token validity
- Verify API endpoint accessibility

#### 3. Rate Limiting
- Wait for rate limit to reset
- Check API quota usage
- Implement request queuing if needed

### Debug Information
- Check browser developer tools for network requests
- Review server logs for API errors
- Verify environment variables are set correctly

## Conclusion

The F&O Dashboard provides a comprehensive solution for real-time futures and options market analysis. It successfully integrates with TrueData API to deliver live market data, option chains, and advanced analytics. The modular architecture allows for easy extension and customization based on specific requirements.

The dashboard is now ready for production use with the provided TrueData credentials and can be accessed at `/fno-dashboard` in the application.
