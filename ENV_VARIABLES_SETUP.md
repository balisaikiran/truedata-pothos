# Vercel Environment Variables Setup Guide

## Quick Reference: Required Environment Variables

Here are all the environment variables you need to set in Vercel:

### 🔴 Required (Must Set)

| Variable Name | Example Value | Description |
|---------------|---------------|-------------|
| `JWT_SECRET` | `your-super-secret-jwt-key-min-32-chars` | Secret key for JWT token signing (use a strong random string) |
| `TRUEDATA_API_URL` | `https://api.truedata.in` | TrueData API base URL |
| `TRUEDATA_HISTORY_URL` | `https://history.truedata.in` | TrueData History API base URL |
| `CLIENT_URL` | `https://your-app.vercel.app` | Your Vercel deployment URL for CORS |

### 🟡 Optional (Some features may not work without these)

| Variable Name | Example Value | Description |
|---------------|---------------|-------------|
| `TRUEDATA_USERNAME` | `your-username` | TrueData API username (needed for some endpoints) |
| `TRUEDATA_PASSWORD` | `your-password` | TrueData API password (needed for some endpoints) |

---

## Step-by-Step: How to Set Environment Variables in Vercel

### Method 1: Via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Log in to your account

2. **Select Your Project**
   - Click on your project name from the dashboard
   - If you haven't created the project yet, import it first

3. **Navigate to Settings**
   - Click on the **Settings** tab (top navigation)

4. **Go to Environment Variables**
   - In the left sidebar, click **Environment Variables**

5. **Add Each Variable**
   For each variable:
   - Click **Add New** button
   - Enter the **Key** (variable name)
   - Enter the **Value** (variable value)
   - Select which environments to apply to:
     - ✅ **Production** (for production deployments)
     - ✅ **Preview** (for preview deployments)
     - ✅ **Development** (for local development with `vercel dev`)
   - Click **Save**

6. **Repeat for All Variables**
   - Add all 6 variables listed above
   - Make sure to check all three environments (Production, Preview, Development)

7. **Redeploy**
   - After adding all variables, go to **Deployments** tab
   - Click the **...** menu on the latest deployment
   - Click **Redeploy** to apply the new environment variables

### Method 2: Via Vercel CLI

1. **Install Vercel CLI** (if not already installed)
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Link Your Project** (if not already linked)
   ```bash
   vercel link
   ```

4. **Add Environment Variables**
   ```bash
   # Add JWT_SECRET
   vercel env add JWT_SECRET production preview development
   
   # Add TRUEDATA_API_URL
   vercel env add TRUEDATA_API_URL production preview development
   
   # Add TRUEDATA_HISTORY_URL
   vercel env add TRUEDATA_HISTORY_URL production preview development
   
   # Add CLIENT_URL
   vercel env add CLIENT_URL production preview development
   
   # Add TRUEDATA_USERNAME (optional)
   vercel env add TRUEDATA_USERNAME production preview development
   
   # Add TRUEDATA_PASSWORD (optional)
   vercel env add TRUEDATA_PASSWORD production preview development
   ```

   When prompted, paste the value for each variable.

5. **Redeploy**
   ```bash
   vercel --prod
   ```

---

## Important Notes

### 🔐 Security Best Practices

1. **JWT_SECRET**: 
   - Generate a strong random string (at least 32 characters)
   - You can generate one using:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Never commit this to Git!

2. **CLIENT_URL**:
   - Set this to your actual Vercel deployment URL
   - Format: `https://your-project-name.vercel.app`
   - For multiple environments, use comma-separated values:
     ```
     https://your-app.vercel.app,https://your-app-git-main.vercel.app
     ```
   - After first deployment, you'll get the actual URL - update CLIENT_URL with that

3. **API Credentials**:
   - Keep `TRUEDATA_USERNAME` and `TRUEDATA_PASSWORD` secure
   - Don't share these values publicly

### 🎯 Environment-Specific Values

You can set different values for different environments:
- **Production**: Use your production TrueData credentials
- **Preview**: Use test/staging credentials (if available)
- **Development**: Use local development values

### 📝 Example Values

Here's what your environment variables might look like:

```
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
TRUEDATA_API_URL=https://api.truedata.in
TRUEDATA_HISTORY_URL=https://history.truedata.in
CLIENT_URL=https://trueData-pothos.vercel.app
TRUEDATA_USERNAME=your_username_here
TRUEDATA_PASSWORD=your_password_here
```

### ⚠️ Common Mistakes

1. **Missing CLIENT_URL**: Your API will reject requests due to CORS
2. **Wrong CLIENT_URL**: Must match your actual Vercel deployment URL
3. **Weak JWT_SECRET**: Use a strong random string, not "secret" or "password"
4. **Not setting for all environments**: Set for Production, Preview, AND Development
5. **Forgetting to redeploy**: Changes take effect after redeployment

---

## Verification

After setting environment variables:

1. **Check they're set correctly**:
   - Go to Settings → Environment Variables
   - Verify all variables are listed

2. **Test the deployment**:
   - Visit `https://your-app.vercel.app/api/health`
   - Should return: `{"status":"OK","mode":"serverless",...}`

3. **Check logs**:
   - Go to Deployments → Latest deployment → Functions
   - Check serverless function logs for any errors

---

## Need Help?

- Vercel Docs: [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables)
- Check deployment logs in Vercel dashboard if something doesn't work

