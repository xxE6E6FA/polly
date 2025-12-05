# Progressive Web App (PWA)

Polly ships as a minimal PWA with offline support for the app shell.

## Overview

- `public/manifest.webmanifest` - App metadata and icons
- `public/sw.js` - Service worker for caching
- Registration in `src/entry.client.tsx` (production only)

## How It Works

On first load, the service worker caches:
- `/index.html` (app shell)
- Core static assets (JS, CSS)

SPA navigations work offline via the cached shell. Dynamic API calls will naturally fail while offline, but the UI remains functional.

## Installation

Users can install Polly as a standalone app:
- **Desktop**: Click the install icon in the browser address bar
- **Mobile**: Use "Add to Home Screen" from the browser menu

## Clearing Caches

If you need to force a fresh load:

### Via DevTools
1. Open DevTools → Application tab
2. Click "Clear storage"

### Via Code
```javascript
navigator.serviceWorker.controller?.postMessage('CLEAR_POLLY_CACHES')
```

## Development Notes

- Service worker only registers in production builds
- During development, caching is disabled to ensure fresh content
- After deploying updates, users get new content on next visit (service worker updates in background)
