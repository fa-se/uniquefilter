'use strict';

const STATE_STORAGE_KEY = 'poe-oauth-state';

export class PoeApiAuth {
    static handleAuthorization(){
        // Surface auth errors propagated from /oauth2callback via the auth_error query param.
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('auth_error')) {
            console.warn('Authorization failed:', urlParams.get('auth_error'));
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
