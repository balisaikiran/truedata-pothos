# Troubleshooting 500 Error on Vercel

## Quick Debugging Steps

### 1. Check Vercel Function Logs ⚠️ MOST IMPORTANT

The most important step is to check the actual error logs:

1. Go to your Vercel dashboard
2. Select your project
3. Go to **Deployments** tab
4. Click on the latest deployment
5. Go to **Functions** tab
6. Click on `/api/index` function
7. Check the **Logs** tab

You should see logs like:
- `[timestamp] POST /api/auth/login`
- `Environment check: { hasJwtSecret: true/false, ... }`
- Any error messages

### 2. Test Health Endpoint First

Before testing login, test the health endpoint:

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

**If `hasJwtSecret`, `hasTrueDataApi`, or `hasTrueDataHistory` are `false`, your environment variables are not set correctly!**

### 3. Verify Environment Variables

1. Go to **Settings** → **Environment Variables**
2. Verify all variables are set:
   - `JWT_SECRET` ✅
   - `TRUEDATA_API_URL` ✅
   - `TRUEDATA_HISTORY_URL` ✅
   - `CLIENT_URL` ✅ (optional but recommended)
   - `TRUEDATA_USERNAME` (optional)
   - `TRUEDATA_PASSWORD` (optional)

3. **Important**: Make sure they're set for **Production** environment
4. **After adding/changing variables**, you MUST redeploy!

### 4. Common Issues and Fixes

#### Issue: Environment Variables Not Loading

**Symptoms**: 
- Health endpoint shows `hasJwtSecret: false`
- Errors about `process.env.JWT_SECRET` being undefined

**Fix**:
1. Double-check variable names (case-sensitive!)
2. Make sure they're set for **Production** environment
3. Redeploy after adding variables
4. Wait a few minutes for changes to propagate

#### Issue: CORS Errors

**Symptoms**:
- CORS errors in browser console
- 500 errors on API calls

**Fix**:
1. Set `CLIENT_URL` to your Vercel URL: `https://truedata-pothos.vercel.app`
2. Or set it to `*` temporarily for testing (not recommended for production)
3. Redeploy

#### Issue: Missing Dependencies

**Symptoms**:
- Build succeeds but runtime errors
- "Cannot find module" errors

**Fix**:
1. Make sure `serverless-http` is in `dependencies` (not `devDependencies`)
2. Check `package.json`:
   ```json
   "dependencies": {
     "serverless-http": "^x.x.x"
   }
   ```

#### Issue: Route Not Found

**Symptoms**:
- 404 errors instead of 500
- Routes not matching

**Fix**:
1. Check `vercel.json` rewrite rules
2. Verify routes are mounted at `/api/*` in Express
3. Check function logs for actual request path

### 5. Test Locally with Vercel

You can test the serverless function locally:

```bash
# Install Vercel CLI
npm install -g vercel

# Link project
vercel link

# Run locally
vercel dev
```

This will run your app locally with Vercel's serverless environment.

### 6. Check Error Format

The error response should match what your frontend expects. Check your frontend code to see what format it expects.

Current error format:
```json
{
  "success": false,
  "error": {
    "code": "500",
    "message": "Error message here"
  }
}
```

### 7. Enable Debug Mode

Add this to your Vercel environment variables to see more details:
- `NODE_ENV=development` (temporarily, for debugging)

This will include stack traces in error responses.

## Still Not Working?

1. **Check the logs** - This is the most important step!
2. **Test health endpoint** - Verify environment variables are loading
3. **Try a simple endpoint** - Test `/api/health` before testing `/api/auth/login`
4. **Check build logs** - Make sure build completed successfully
5. **Verify Node.js version** - Vercel uses Node.js 18.x by default

## Quick Test Commands

```bash
# Test health endpoint
curl https://truedata-pothos.vercel.app/api/health

# Test login (replace with actual credentials)
curl -X POST https://truedata-pothos.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

