# Quick Setup Checklist - Supabase Integration

## ✅ Step 1: Create Database Tables

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/hddpltxsnoiyyhinvtie
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Copy the entire contents of `supabase-schema.sql` file
5. Paste into the SQL editor
6. Click **Run** (or press Ctrl+Enter)
7. Verify success - you should see "Success. No rows returned"
8. Go to **Table Editor** to verify these tables exist:
   - ✅ `fno_market_cache`
   - ✅ `ltp_cache`
   - ✅ `bars_cache`
   - ✅ `option_chain_cache`

## ✅ Step 2: Add Environment Variables to Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add these two variables:

### Variable 1:
- **Key**: `SUPABASE_URL`
- **Value**: `https://hddpltxsnoiyyhinvtie.supabase.co`
- **Environment**: Select all (Production, Preview, Development)
- Click **Save**

### Variable 2:
- **Key**: `SUPABASE_SERVICE_ROLE_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZHBsdHhzbm9peXloaW52dGllIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIzNTk3MCwiZXhwIjoyMDc3ODExOTcwfQ.dbkBTER0sUDJezgM7peYBA6CxwWaUik_vC-5eAgZeFM`
- **Environment**: Select all (Production, Preview, Development)
- Click **Save**

⚠️ **Important**: After adding variables, you MUST redeploy your Vercel project for changes to take effect.

## ✅ Step 3: Redeploy Vercel Project

After adding environment variables:
1. Go to **Deployments** tab in Vercel
2. Click the **⋯** menu on the latest deployment
3. Click **Redeploy**
4. Or simply push a new commit to trigger auto-deploy

## ✅ Step 4: Verify It's Working

After deployment, check your Vercel function logs:

1. Go to **Deployments** → Click on latest deployment
2. Click **Functions** tab
3. Click on any function (e.g., `/api/fno/market-data`)
4. Look for logs like:
   - ✅ `[Supabase] Client initialized successfully`
   - ✅ `✅ [Supabase] Returning cached FNO market data`
   - ✅ `✅ [Supabase] Cached 12 stocks for 5 minutes`

If you see warnings like `[Supabase] Not configured`, the environment variables aren't set correctly.

## 🧪 Test the Cache

1. Make a request to `/api/fno/market-data` - it should fetch from API and cache
2. Make the same request again within 5 minutes - it should return cached data instantly
3. Check Supabase dashboard → **Table Editor** → `fno_market_cache` to see cached entries

## 📊 Monitor Cache Usage

- **Supabase Dashboard** → **Table Editor** → View cache tables
- **Vercel Logs** → Look for `[Supabase]` prefixed messages
- **Response Headers** → Look for `fromSupabase: true` in API responses

## 🐛 Troubleshooting

### "Supabase URL and Key must be set"
- Check environment variables are added in Vercel
- Make sure you redeployed after adding variables
- Verify variable names are exactly: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### "relation does not exist" or table errors
- Run the SQL schema (`supabase-schema.sql`) in Supabase SQL Editor
- Verify tables were created in Table Editor

### Still getting 429 errors
- Check if cache is being hit (look for `fromSupabase: true` in responses)
- Verify Supabase is working (check dashboard)
- Check Vercel logs for Supabase errors

## 🎉 Success Indicators

You'll know it's working when:
- ✅ No more 429 rate limit errors (or significantly reduced)
- ✅ Faster API responses (cached data returns instantly)
- ✅ Vercel logs show `[Supabase]` success messages
- ✅ Supabase tables contain cached data
- ✅ API responses include `fromSupabase: true` flag

---

**Your Supabase Project**: https://hddpltxsnoiyyhinvtie.supabase.co
**Project ID**: `hddpltxsnoiyyhinvtie`

