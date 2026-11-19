import secrets from './secrets.js';
import { USER_AGENT } from './user-agent.js';

const client_id = "uniquefilter";

export default {
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
                client_secret: secrets.client_secret,
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
