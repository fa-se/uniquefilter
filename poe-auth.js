import fs from 'fs';
import path from 'path';
import { USER_AGENT } from './user-agent.js';

const client_id = "uniquefilter";

/**
 * Read the OAuth client secret. In production it comes from a systemd credential
 * (LoadCredential=poe-client-secret:...), so it lives outside the code checkout and
 * only the service can read it. POE_CLIENT_SECRET is for running the server locally.
 * @returns {string}
 */
function readClientSecret() {
    const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
    if (credentialsDirectory) {
        return fs.readFileSync(path.join(credentialsDirectory, 'poe-client-secret'), 'utf8').trim();
    }
    if (process.env.POE_CLIENT_SECRET) {
        return process.env.POE_CLIENT_SECRET;
    }
    throw new Error('No PoE client secret: set LoadCredential=poe-client-secret:<file> or POE_CLIENT_SECRET');
}

export default {
    /**
     * Throw if the client secret can't be read, so a misconfiguration shows up at
     * startup instead of at the first login.
     */
    checkClientSecret() {
        if (readClientSecret() === '') throw new Error('PoE client secret is empty');
    },

    /**
     * Exchange an authorization code from the PoE OAuth callback for an access/refresh token pair.
     * Returns the parsed token-response object; the caller is responsible for rendering the
     * client-facing response.
     * @param {string} code
     * @returns {Promise<{access_token: string, refresh_token: string, expires_in: number, token_type: string, scope: string}>}
     */
    async exchangeCodeForTokens(code) {
        const response = await fetch('https://pathofexile.com/oauth/token', {
            method: 'POST',
            headers: { 'User-Agent': USER_AGENT },
            body: new URLSearchParams({
                code,
                redirect_uri: "https://uniquefilter.dev/oauth2callback",
                grant_type: "authorization_code",
                client_id: client_id,
                client_secret: readClientSecret(),
                scope: 'account:profile account:stashes account:item_filter'
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            throw new Error(`Token endpoint answered HTTP ${response.status}`);
        }
        return await response.json();
    }
}
