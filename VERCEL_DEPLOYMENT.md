# Vercel Deployment Guide

This guide will help you deploy the TrueData-Pothos application to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Your project repository pushed to GitHub, GitLab, or Bitbucket

## Environment Variables

Before deploying, you need to set the following environment variables in your Vercel project settings:

### Required Environment Variables

1. **JWT_SECRET** - Secret key for JWT token signing (use a strong random string)
   ```
   Example: your-super-secret-jwt-key-change-this-in-production
   ```

2. **TRUEDATA_API_URL** - TrueData API base URL
   ```
   Example: https://api.truedata.in
   ```

3. **TRUEDATA_HISTORY_URL** - TrueData History API base URL
   ```
   Example: https://history.truedata.in
   ```

4. **TRUEDATA_USERNAME** - TrueData API username (optional, for some endpoints)
   ```
   Example: your-username
   ```

5. **TRUEDATA_PASSWORD** - TrueData API password (optional, for some endpoints)
   ```
   Example: your-password
   ```

6. **CLIENT_URL** - Frontend URL(s) for CORS (comma-separated for multiple URLs)
   ```
   Example: https://your-app.vercel.app
   Or multiple: https://your-app.vercel.app,https://preview-url.vercel.app
   ```

### How to Set Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable for **Production**, **Preview**, and **Development** environments
5. Click **Save**

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard

1. **Import Project**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your Git repository
   - Vercel will auto-detect the settings

2. **Configure Build Settings**
   - Framework Preset: **Vite**
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `dist` (auto-detected)
   - Install Command: `npm install` (auto-detected)

3. **Set Environment Variables**
   - Add all required environment variables as mentioned above

4. **Deploy**
   - Click **Deploy**
   - Wait for the build to complete

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   
   For production deployment:
   ```bash
   vercel --prod
   ```

## Project Structure

The project is configured with:
- **Frontend**: React + Vite application in `/src`
- **Backend API**: Express serverless functions in `/api`
- **Build Output**: Static files in `/dist`

## Important Notes

### WebSocket Limitations

⚠️ **WebSocket is disabled in serverless mode** (Vercel deployment)

- WebSocket connections are not supported in Vercel serverless functions
- The application automatically detects serverless mode and disables WebSocket initialization
- Real-time features using WebSocket will not work in production
- For local development with WebSocket, run `npm run server:dev`

### API Routes

All API routes are handled by `/api/index.ts` which:
- Wraps Express app with `serverless-http` for Vercel compatibility
- Handles CORS headers automatically
- Routes all `/api/*` requests to the Express app

### Routing

- Frontend routes: Handled by React Router (all routes serve `/index.html`)
- API routes: All `/api/*` requests go to `/api/index.ts`
- Health check: `/api/health` endpoint available

## Local Development vs Production

### Local Development
```bash
# Run both frontend and backend
npm run dev

# Or run separately
npm run client:dev  # Frontend only
npm run server:dev  # Backend only (includes WebSocket)
```

### Production Build
```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Troubleshooting

### Build Fails

1. **Check Node.js version**
   - Vercel uses Node.js 18.x by default
   - Ensure your code is compatible

2. **Check environment variables**
   - All required variables must be set
   - Check Vercel dashboard → Settings → Environment Variables

3. **Check build logs**
   - Go to Vercel dashboard → Deployments → Click on failed deployment
   - Review build logs for errors

### API Routes Not Working

1. **Check vercel.json**
   - Ensure rewrites are configured correctly
   - `/api/*` should route to `/api/index`

2. **Check CORS settings**
   - Verify `CLIENT_URL` environment variable is set correctly
   - Should match your Vercel deployment URL

3. **Check function logs**
   - Go to Vercel dashboard → Functions
   - Check serverless function logs

### Environment Variables Not Loading

1. **Restart deployment**
   - After adding environment variables, redeploy
   - Environment variables are injected at build time

2. **Check variable names**
   - Ensure exact spelling matches code
   - Case-sensitive

## Post-Deployment

After successful deployment:

1. **Test API endpoints**
   - Visit `https://your-app.vercel.app/api/health`
   - Should return: `{"status":"OK","mode":"serverless",...}`

2. **Test frontend**
   - Visit `https://your-app.vercel.app`
   - Should load the React application

3. **Test authentication**
   - Try logging in
   - Verify API calls work correctly

## Support

For issues or questions:
- Check Vercel documentation: [vercel.com/docs](https://vercel.com/docs)
- Check project README.md
- Review deployment logs in Vercel dashboard

