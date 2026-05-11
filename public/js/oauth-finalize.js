'use strict';

// Runs only on the /oauth2callback HTML response served by app.js. The server
// has already exchanged the auth code for tokens and embedded them — plus the
// `state` PoE echoed back — in a non-executable JSON script tag. This module
// verifies state against what poe-api-auth.js stashed in sessionStorage,
// writes tokens to localStorage, and replaces history so the callback URL
// never lingers in the address bar or back-button history.

const STATE_STORAGE_KEY = 'poe-oauth-state';

function readPayload() {
    const node = document.getElementById('oauth-payload');
    if (!node) return null;
    try {
        return JSON.parse(node.textContent);
    } catch {
        return null;
    }
}

function failAndGoHome(reason) {
    console.error('OAuth finalize failed:', reason);
    window.sessionStorage.removeItem(STATE_STORAGE_KEY);
    window.location.replace('/?auth_error=' + encodeURIComponent(reason));
}

const payload = readPayload();
if (!payload) {
    failAndGoHome('missing_payload');
} else {
    const expectedState = window.sessionStorage.getItem(STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(STATE_STORAGE_KEY);

    if (!expectedState || !payload.state || expectedState !== payload.state) {
        failAndGoHome('state_mismatch');
    } else if (!payload.access_token || !payload.expires_in) {
        failAndGoHome('invalid_token_response');
    } else {
        const expiry = Date.now() + Number(payload.expires_in) * 1000;
        window.localStorage.setItem('poe-access-token', payload.access_token);
        window.localStorage.setItem('poe-access-token-expiry', String(expiry));
        if (payload.refresh_token) {
            window.localStorage.setItem('poe-refresh-token', payload.refresh_token);
        }
        window.location.replace('/');
    }
}
