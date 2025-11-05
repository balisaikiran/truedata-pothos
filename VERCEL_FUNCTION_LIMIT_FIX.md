# Vercel Serverless Function Limit Fix

## Problem
Vercel Hobby plan limits deployments to 12 serverless functions. Each file in the `api/` directory was being treated as a separate function, exceeding this limit.

## Solution
Configured Vercel to only create ONE serverless function (`api/index.ts`) that handles all routes through Express.

### Changes Made:

1. **Updated `vercel.json`**:
   - Added `functions` configuration to explicitly declare only `api/index.ts` as a serverless function
   - Set `maxDuration: 30` seconds for the function
   - All routes are handled by Express app through rewrites

2. **Created `.vercelignore`**:
   - Explicitly excludes other files from being treated as functions
   - Only `api/index.ts` will be deployed as a function

3. **Updated `api/index.ts`**:
   - Improved async handling to properly await Express app
   - Added better error handling for unhandled routes

## How It Works:

```
Request → /api/fno/market-data
    ↓
Vercel Rewrite → /api/index
    ↓
Express App → Routes all to appropriate handlers
    ↓
Response
```

All API routes (`/api/auth/*`, `/api/data/*`, `/api/fno/*`, etc.) are handled by the single Express app instance in `api/index.ts`.

## Deployment

After these changes:
1. Commit and push to your repository
2. Vercel will only create **1 serverless function** instead of multiple
3. All routes will still work correctly through Express routing

## Verification

After deployment, check Vercel dashboard:
- **Functions** tab should show only **1 function**: `api/index.ts`
- All API routes should still work correctly
- No more "12 function limit" errors

