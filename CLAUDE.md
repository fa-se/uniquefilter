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
- **poe-api-interface.js**: Path of Exile API client (wraps fetch, gates on auth, exports `NotAuthorizedError`)
- **poe-api-auth.js**: Frontend OAuth handling (persists CSRF state in sessionStorage)
- **oauth-finalize.js**: Runs only on the `/oauth2callback` HTML stub — verifies state, writes tokens to localStorage, replaces history
- **filter.js**: Item filter manipulation and generation; returns a tagged `{status: success|throttled|error}` from upload
- **stash.js**: Stash data models and unique item detection
- **state.js**: Global application state management
- **ui.js**: DOM manipulation and UI rendering
- **rate-limit.js**: Leaf module — `RateLimitError`, the global pause flag, header parsing, `computeWaitSeconds`/`getRemainingSlots`
- **utils.js**: `withRateLimitHandling` retry wrapper

### Key Data Files
- **public/json/drop-enabled-uniques.json**: All unique items that can drop
- **public/json/global-drop-enabled-uniques.json**: Only globally-available unique items
- **leagues.json**: Cached league data for detecting new leagues

## Authentication Flow

1. User clicks "Authorize" → `poe-api-auth.js` generates a CSRF `state`, persists it to `sessionStorage`, and redirects to PoE OAuth.
2. PoE redirects to `/oauth2callback?code=...&state=...`.
3. The Node server exchanges the code for tokens via `poe-auth.js#exchangeCodeForTokens`, then renders an HTML stub page that embeds the tokens + echoed `state` in a `<script type="application/json">` block (escaping `<` to defeat `</script>` breakout). Tokens never appear in any URL.
4. `oauth-finalize.js` (loaded by the stub) reads the embedded payload, compares `state` against the value in `sessionStorage`, writes tokens to `localStorage` only on match, then `location.replace('/')`. Mismatch or missing payload redirects to `/?auth_error=<reason>`.
5. `localStorage` tokens are read per-call by `PoeApi`'s `accessToken` getter so token refreshes don't require re-instantiation.

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

## Production Deployment

**Production Server:** `raspberrypi` (accessible via SSH with public key auth)
**Production URL:** https://uniquefilter.dev
**Node app path:** `/home/pi/uniquefilter/` (systemd unit `uniquefilter.service`, runs on `127.0.0.1:8080`)
**Webserver:** Caddy (systemd unit `caddy`). Config at **`/etc/caddy/Caddyfile`** — the repo's `Caddyfile` is the source of truth and deploys directly there. There is no copy under `/home/pi/uniquefilter/`; do not re-create one.

### Deploy Node app code (rsync to `/home/pi/uniquefilter/`)
1. **Dry run first:** `rsync -avn public/js/*.js pi@raspberrypi:/home/pi/uniquefilter/public/js/`
2. **Verify changes:** check the file list matches what you expect.
3. **Deploy files with CORRECT PATHS:**
   - `rsync -av public/js/*.js pi@raspberrypi:/home/pi/uniquefilter/public/js/`
   - `rsync -av public/css/style.css pi@raspberrypi:/home/pi/uniquefilter/public/css/`
   - `rsync -av app.js poe-auth.js cors-proxy.js pi@raspberrypi:/home/pi/uniquefilter/`
4. **Restart service:** `ssh pi@raspberrypi "sudo systemctl restart uniquefilter"`
5. **Check status:** `ssh pi@raspberrypi "sudo systemctl is-active uniquefilter && sudo journalctl -u uniquefilter -n 5 --no-pager"`
6. **Verify deployment:** `curl -s https://uniquefilter.dev/js/<file>.js | wc -c` and compare to local.

### Deploy Caddyfile change
1. `scp Caddyfile pi@raspberrypi:/tmp/Caddyfile.new`
2. `ssh pi@raspberrypi "sudo caddy validate --config /tmp/Caddyfile.new --adapter caddyfile"` — must report "Valid configuration".
3. `ssh pi@raspberrypi "sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.\$(date +%Y%m%d-%H%M%S) && sudo cp /tmp/Caddyfile.new /etc/caddy/Caddyfile && sudo systemctl reload caddy"` (use `reload`, not `restart` — preserves connections).
4. Verify: `curl -sD - -o /dev/null https://uniquefilter.dev/ | grep -i content-security-policy` (or whichever header you changed).

**CRITICAL:** Always deploy app code to the correct `public/` subdirectories, NOT to the root directory. The server serves static files from the `public/` folder structure.

### Production Notes
- Production directory is NOT a git repository — deploy via rsync.
- Caddy serves static files directly from `/home/pi/uniquefilter/public/` via `file_server`; only `/api/*`, `/update-filter`, and `/oauth2callback` proxy to the Node app on `127.0.0.1:8080`. Security headers (CSP, X-Frame-Options, X-Content-Type-Options) are set in the Caddyfile so they cover static responses too; the Node app sets them again for proxied responses as defense in depth.
- Service runs as systemd daemon with auto-restart.
- Check server logs (`journalctl -u uniquefilter` / `journalctl -u caddy`) for security events and rate limiting.

## Testing

No automated tests are currently configured. Test manually by running the server and using the web interface.