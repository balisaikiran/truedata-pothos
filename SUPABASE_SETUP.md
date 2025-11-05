# Supabase Setup Guide for TrueData Cache

## Overview
This project now uses Supabase as a persistent cache layer to reduce API calls to TrueData and avoid 429 (rate limit) errors and timeouts.

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - **Name**: `truedata-cache` (or your preferred name)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to your Vercel deployment
5. Click "Create new project"
6. Wait for the project to be created (takes ~2 minutes)

### 2. Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (for client-side access)
   - **service_role key** (for server-side access - keep this secret!)

### 3. Create Database Tables

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy and paste the entire contents of `supabase-schema.sql`
4. Click "Run" (or press Ctrl+Enter)
5. Verify tables were created by going to **Table Editor** - you should see:
   - `fno_market_cache`
   - `ltp_cache`
   - `bars_cache`
   - `option_chain_cache`

### 4. Set Environment Variables

Add these to your Vercel project environment variables:

**In Vercel Dashboard:**
1. Go to your project → **Settings** → **Environment Variables**
2. Add the following:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**For Local Development:**
Add to your `.env` file:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

⚠️ **Important**: Use `SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_ANON_KEY`) for server-side operations. The service role key bypasses Row Level Security (RLS).

### 5. Deploy

After setting environment variables:
1. Commit your changes
2. Push to your repository
3. Vercel will automatically redeploy

## How It Works

### Cache Flow:
1. **Request comes in** → Check Supabase cache first
2. **If cached data exists and is fresh** → Return immediately (no API call!)
3. **If cache miss or expired** → Fetch from TrueData API
4. **Save fetched data** → Store in both Supabase (5 min TTL) and memory cache (60 sec TTL)
5. **Return data** → Send to client

### Cache TTL (Time To Live):
- **FNO Market Data**: 5 minutes in Supabase, 60 seconds in memory
- **LTP Data**: 2 minutes in Supabase, 30 seconds in memory
- **Bar Data**: 5 minutes in Supabase, 60 seconds in memory
- **Option Chain**: 5 minutes in Supabase, 60 seconds in memory

### Benefits:
- ✅ **Reduces API calls** by ~80-90%
- ✅ **Eliminates 429 rate limit errors** for cached data
- ✅ **Faster response times** (no API wait for cached data)
- ✅ **Persistent cache** survives server restarts (unlike memory cache)
- ✅ **Automatic expiration** - old data is automatically cleaned up

## Monitoring

### Check Cache Status:
- Go to Supabase dashboard → **Table Editor**
- View the cache tables to see:
  - How many entries are cached
  - When data expires
  - Last update times

### View Cache Logs:
Check your Vercel function logs for messages like:
- `✅ [Supabase] Returning cached FNO market data`
- `✅ [Supabase] Cached 12 stocks for 5 minutes`
- `⚠️ [Supabase] Cache check failed, falling back to memory cache`

## Troubleshooting

### Issue: "Supabase URL and Key must be set"
**Solution**: Make sure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel environment variables.

### Issue: "Failed to cache data"
**Solution**: 
1. Check that tables were created (run `supabase-schema.sql`)
2. Verify service role key is correct
3. Check Supabase project is active

### Issue: Cache not working
**Solution**:
1. Check Vercel logs for Supabase errors
2. Verify environment variables are set correctly
3. Test Supabase connection manually

### Issue: Still getting 429 errors
**Solution**: 
- Cache TTL might be too short - increase in code if needed
- Check if cache is actually being hit (look for `fromSupabase: true` in responses)
- Verify Supabase is working (check dashboard)

## Optional: Cleanup Expired Cache

You can set up a cron job in Supabase to automatically clean up expired entries:

1. Go to **Database** → **Functions**
2. Create a new function that calls `cleanup_expired_cache()`
3. Schedule it to run every hour

Or manually run:
```sql
SELECT cleanup_expired_cache();
```

## Cost Considerations

Supabase Free Tier includes:
- 500 MB database storage
- 2 GB bandwidth per month
- Unlimited API requests

For this caching use case, the free tier should be sufficient unless you have very high traffic.

