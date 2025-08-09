# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UniqueFilter is a Path of Exile item filter management tool that automatically highlights missing unique items in your stash. It consists of a Node.js backend server and a vanilla JavaScript frontend that integrates with the Path of Exile API.

## Development Commands

**Start the server:**
```bash
node app.js
```
Note: OAuth with PoE API only works on production domain https://uniquefilter.dev

**Run the unique list updater manually:**
```bash
node poe-uniques-updater.js
```

## Architecture

### Backend (Node.js)
- **app.js**: Main HTTP server handling routes, static files, and API proxying
- **poe-auth.js**: OAuth2 authentication flow with Path of Exile API
- **cors-proxy.js**: CORS proxy for Path of Exile API requests
- **poe-uniques-updater.js**: Fetches and updates unique item lists from PoE Wiki
- **secrets.js**: Configuration file (use secrets.js.sample as template)

### Frontend (Vanilla JavaScript ES6 modules)
- **main.js**: Application entry point and main controller
- **poe-api-interface.js**: Path of Exile API client with rate limiting
- **poe-api-auth.js**: Frontend OAuth handling
- **filter.js**: Item filter manipulation and generation
- **stash.js**: Stash data models and unique item detection
- **state.js**: Global application state management
- **ui.js**: DOM manipulation and UI rendering
- **utils.js**: Rate limiting utilities

### Key Data Files
- **public/json/drop-enabled-uniques.json**: All unique items that can drop
- **public/json/global-drop-enabled-uniques.json**: Only globally-available unique items
- **leagues.json**: Cached league data for detecting new leagues

## Authentication Flow

1. User clicks "Authorize" → redirects to PoE OAuth
2. PoE redirects to `/oauth2callback` with auth code
3. Backend exchanges code for access token via `poe-auth.js`
4. Token stored in localStorage, used for API requests

## Rate Limiting

The application implements careful rate limiting for PoE API requests:
- Uses `withRateLimitHandling()` wrapper for all API calls
- Implements exponential backoff on rate limit errors
- Stores rate limit state in localStorage
- Sequential stash fetching to avoid overwhelming the API

## Filter Update Process

1. Fetch user's stash contents via PoE API
2. Compare against cached unique item lists
3. Generate list of missing unique items
4. Create/update filter rule highlighting missing items
5. Upload modified filter back to PoE API

## State Management

The frontend uses a simple state management pattern:
- `state.js` exports `appState` object and `setState()` function
- All state changes go through `setState()` 
- UI re-renders after state changes via `render()`

## Configuration

Copy `secrets.js.sample` to `secrets.js` and configure:
- `client_secret`: PoE API OAuth client secret
- Other API credentials as needed

## Testing

No automated tests are currently configured. Test manually by running the server and using the web interface.