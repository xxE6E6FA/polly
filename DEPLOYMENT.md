# Vercel Deployment Guide

This guide covers deploying the Polly app to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed (optional): `bun i -g vercel`
3. Your Convex deployment URL

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Go to https://vercel.com/new
3. Import your Git repository
4. Configure environment variables:
    - `VITE_CONVEX_URL`: Your Convex deployment URL
    - `GEMINI_API_KEY`: Google Gemini API key for PDF text extraction
5. Click "Deploy"

### Option 2: Deploy via CLI

1. Run `vercel` in your project directory
2. Follow the prompts
3. Set environment variables when prompted:
    - `VITE_CONVEX_URL`: Your Convex deployment URL
    - `GEMINI_API_KEY`: Google Gemini API key for PDF text extraction

## Environment Variables

Required environment variables for production:

- `VITE_CONVEX_URL`: Your Convex deployment URL (e.g., https://your-app.convex.cloud)
- `GEMINI_API_KEY`: Google Gemini API key for PDF text extraction (required for PDF upload support)

## Post-Deployment

1. **Custom Domain**: Add your custom domain in Vercel project settings
2. **Environment Variables**: Update any production-specific variables
3. **Analytics**: Vercel Analytics is already integrated and will start collecting data automatically

## Configuration Details

### vercel.json

- Framework: Vite
- Build Command: `bun run build`
- Output Directory: `dist`
- Rewrites: All routes redirect to index.html for client-side routing
- Headers: Static assets are cached for 1 year

### Optimizations Applied

- Code splitting for better performance
- Source maps disabled in production
- Vercel Analytics integrated
- Proper caching headers for assets

## Troubleshooting

### Build Failures

- Ensure all dependencies are listed in package.json
- Check that environment variables are set correctly
- Review build logs in Vercel dashboard

### @convex-dev/auth Build Issues

If you encounter build errors with `@convex-dev/auth`, ensure your `vite.config.ts` excludes it from optimization:

```javascript
optimizeDeps: {
  exclude: ["@convex-dev/auth"],
}
```

### Routing Issues

- The rewrites configuration ensures client-side routing works correctly
- All routes will serve index.html and let React Router handle navigation

### Performance

- Check the Analytics tab in Vercel dashboard for performance metrics
- Use Vercel's Speed Insights to identify optimization opportunities
- Consider further code splitting for large chunks (>1MB)

### Large Bundle Size

If you see warnings about chunk sizes:

1. Use dynamic imports for large components
2. Split vendor chunks more granularly
3. Consider lazy loading routes that aren't immediately needed

## Quick Deploy Checklist

- [ ] Environment variables configured (especially `VITE_CONVEX_URL`)
- [ ] Build runs successfully locally (`bun run build`)
- [ ] Git repository is up to date
- [ ] Vercel project connected to Git repository
- [ ] Custom domain configured (optional)
- [ ] Preview deployment tested before promoting to production
