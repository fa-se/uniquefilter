import got from 'got';
import secrets from './secrets.js'

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
        const response = await got.post('https://pathofexile.com/oauth/token', {
            form: {
                code,
                redirect_uri: "https://uniquefilter.dev/oauth2callback",
                grant_type: "authorization_code",
                client_id: client_id,
                client_secret: secrets.client_secret,
                scope: 'account:profile account:stashes account:item_filter'
            }
        });
        return JSON.parse(response.body);
    }
}
