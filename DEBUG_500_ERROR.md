# Quick Debugging Steps for 500 Error

## ⚠️ CRITICAL: Check Vercel Function Logs FIRST

The error message `{"error": {"code": "500", "message": "A server error has occurred"}}` is generic. 
**You MUST check the actual logs to see the real error.**

### How to Check Logs:

1. Go to: https://vercel.com/dashboard
2. Click on your project: **truedata-pothos**
3. Click **Deployments** tab
4. Click on the **latest deployment** (should show the timestamp)
5. Click **Functions** tab
6. Click on **`/api/index`** function
7. Click **Logs** tab
8. Look for logs that show:
   - `[timestamp] POST /api/auth/login`
   - `Environment check: { hasJwtSecret: ..., ... }`
   - Any error messages or stack traces

**Share what you see in the logs - that will tell us the exact error!**

## Step 2: Test Health Endpoint

Run this command in your terminal:

```bash
curl https://truedata-pothos.vercel.app/api/health
```

This should return:
```json
{
  "status": "OK",
  "timestamp": "...",
  "version": "1.0.0",
  "mode": "serverless",
  "env": {
    "hasJwtSecret": true,
    "hasTrueDataApi": true,
    "hasTrueDataHistory": true
  }
}
```

**If any of those `env` values are `false`, that's your problem!**

## Step 3: Verify Environment Variables

From your screenshot, I see you have:
- ✅ JWT_SECRET
- ✅ TRUEDATA_API_URL
- ✅ TRUEDATA_HISTORY_URL
- ✅ CLIENT_URL
- ✅ TRUEDATA_AUTH_URL

**Important checks:**
1. Are they set for **Production** environment? (not just Preview/Development)
2. Did you **redeploy** after adding them?
3. Are the **values correct**? (not empty or wrong URLs)

## Step 4: Common Issues

### Issue 1: Environment Variables Not Loading
- **Symptom**: Health endpoint shows `hasJwtSecret: false`
- **Fix**: 
  1. Double-check variable names (case-sensitive!)
  2. Make sure they're set for **Production**
  3. **Redeploy** after adding/changing variables

### Issue 2: Missing JWT_SECRET
- **Symptom**: Error about JWT_SECRET being undefined
- **Fix**: The code now checks for this and will return a clear error message

### Issue 3: Network Timeout
- **Symptom**: Timeout errors when calling TrueData API
- **Fix**: Added 10-second timeouts, but TrueData API might be slow

### Issue 4: CORS Issues
- **Symptom**: CORS errors in browser console
- **Fix**: Set `CLIENT_URL` to `https://truedata-pothos.vercel.app`

## Step 5: Redeploy After Changes

After making any changes:
1. Push to Git
2. Vercel will auto-deploy
3. OR manually redeploy from Vercel dashboard

## What I Changed

I've improved error handling:
- ✅ Added better error logging
- ✅ Added environment variable checks
- ✅ Added timeout handling
- ✅ Improved error messages

**But the logs will tell us the real issue!**

---

## Next Steps

1. **Check the logs** (most important!)
2. **Test health endpoint** - Share the output
3. **Redeploy** if you changed environment variables
4. **Share the logs** with me so I can help debug further

