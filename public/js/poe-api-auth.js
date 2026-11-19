'use strict';

const STATE_STORAGE_KEY = 'poe-oauth-state';
const TOKEN_STORAGE_KEYS = ['poe-access-token', 'poe-access-token-expiry', 'poe-refresh-token'];

// Shown next to the authorize button for /?auth_error=<reason>. Only known reasons
// get a message: the parameter comes from the URL, so echoing it would let a crafted
// link put arbitrary text on the page.
const AUTH_ERROR_MESSAGES = {
    token_rejected: 'Your Path of Exile login expired or was revoked. Please authorize again.',
    missing_code: 'Authorization was cancelled or failed. Please try again.',
    token_exchange_failed: 'Authorization failed while talking to Path of Exile. Please try again.',
    state_mismatch: 'Authorization failed a security check. Please start it again from this page.',
    missing_payload: 'Authorization failed. Please try again.',
    invalid_token_response: 'Authorization failed. Please try again.',
};

export class PoeApiAuth {
    static handleAuthorization(){
        // Surface auth errors propagated from /oauth2callback via the auth_error query param.
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('auth_error')) {
            const reason = urlParams.get('auth_error');
            console.warn('Authorization failed:', reason);
            const message = document.createElement('p');
            message.className = 'auth-message';
            message.textContent = AUTH_ERROR_MESSAGES[reason] ?? 'Authorization failed. Please try again.';
            document.getElementById('auth-section').appendChild(message);
            window.history.replaceState({}, '', window.location.pathname);
        }

        // if this client is not yet authorized, prepare the authorization button to direct the user to the pathofexile website
        if (!PoeApiAuth.isAuthorized()) {
            let authorizationButton = document.getElementById(
                "authorize-poe-button"
            );

            // show authorization button
            authorizationButton.style.display = "block";

            // hide elements that require authorization
            document.querySelectorAll('.requires-authorization').forEach((element) => {
                element.style.display = 'none';
            });

            authorizationButton.addEventListener("click", function () {
                // Generate the CSRF state at click time and persist it in sessionStorage so
                // oauth-finalize.js can verify the value PoE echoes back. sessionStorage
                // survives the cross-origin round-trip because it's keyed to the
                // uniquefilter.dev origin and the tab.
                const state = self.crypto.randomUUID();
                window.sessionStorage.setItem(STATE_STORAGE_KEY, state);

                let url = new URL("https://www.pathofexile.com/oauth/authorize");
                url.searchParams.set("client_id", "uniquefilter");
                url.searchParams.set("response_type", "code");
                url.searchParams.set("scope", "account:profile account:stashes account:item_filter")
                url.searchParams.set("redirect_uri", "https://uniquefilter.dev/oauth2callback");
                url.searchParams.set("state", state);
                url.searchParams.set("prompt", "consent");
                window.location = url.toString();
            });
        }
        else {
            // hide authorization button
            document.getElementById("authorize-poe-button").style.display = "none";

            // show elements that require authorization
            document.querySelectorAll('.requires-authorization').forEach((element) => {
                element.style.display = 'flex';
            } );
        }
    }

    // PoE rejected the stored token (expired or revoked; there is no refresh flow).
    // Forget it and reload into the logged-out state, which shows the authorize button.
    static handleRejectedToken() {
        for (const key of TOKEN_STORAGE_KEYS) window.localStorage.removeItem(key);
        window.location.replace('/?auth_error=token_rejected');
    }

    static isAuthorized() {
        let accessData = PoeApiAuth.getPoeAccessData();
        return (accessData.token != null && !PoeApiAuth.#accessTokenExpired());
    }

    static getPoeAccessData() {
        return {
            token: window.localStorage.getItem("poe-access-token"),
            expiry: Number(window.localStorage.getItem("poe-access-token-expiry")),
            refreshToken: window.localStorage.getItem("poe-refresh-token"),
        };
    }

    static #accessTokenExpired() {
        const expiry = PoeApiAuth.getPoeAccessData().expiry;
        const expiryValid = expiry !== null && expiry !== undefined && expiry > 0;
        // If the expiry date is invalid, treat the token as expired
        return !expiryValid || PoeApiAuth.getPoeAccessData().expiry < Date.now().valueOf();
    }
}
