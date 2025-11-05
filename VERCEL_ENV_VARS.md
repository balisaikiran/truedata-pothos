# Environment Variables for Vercel

Add these to your Vercel project environment variables:

## Required Variables

```
SUPABASE_URL=https://hddpltxsnoiyyhinvtie.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZHBsdHhzbm9peXloaW52dGllIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIzNTk3MCwiZXhwIjoyMDc3ODExOTcwfQ.dbkBTER0sUDJezgM7peYBA6CxwWaUik_vC-5eAgZeFM
```

## How to Add in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Click **Add New**
4. Add each variable:
   - **Key**: `SUPABASE_URL`
   - **Value**: `https://hddpltxsnoiyyhinvtie.supabase.co`
   - **Environment**: Select all (Production, Preview, Development)
   - Click **Save**
5. Repeat for `SUPABASE_SERVICE_ROLE_KEY`

## Important Notes

⚠️ **Security**: The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security (RLS). Keep it secret and never expose it in client-side code.

✅ **After adding**: Redeploy your Vercel project for the changes to take effect.

## Verify Setup

After deploying, check your Vercel function logs. You should see:
- `[Supabase] Client initialized successfully` on first use
- `✅ [Supabase] Returning cached FNO market data` when cache is hit
- `✅ [Supabase] Cached X stocks for 5 minutes` when data is saved

If you see warnings like `[Supabase] Not configured`, double-check that the environment variables are set correctly.

