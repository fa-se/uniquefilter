"use strict";

if (document.readyState !== "loading") {
    main();
} else {
    document.addEventListener("DOMContentLoaded", main);
}

async function main() {
    const urlParams = new URLSearchParams(window.location.search);

    // save authorization data if user got redirected during authorization
    if (urlParams.has("access_token")) {
        setPoeAccessData(
            urlParams.get("access_token"),
            Date.now().valueOf() + 1000 * Number(urlParams.get("expires_in")),
            urlParams.get("refresh_token")
        );
        window.location.search = '';
    }

    // if this client is not yet authorized, prepare the authorization button to direct the user to the pathofexile website
    if (!isAuthorized()) {
        let authorizationButton = document.getElementById(
            "authorize-poe-button"
        );

        let state = self.crypto.randomUUID();
        authorizationButton.addEventListener("click", function () {
            let url = new URL("https://www.pathofexile.com/oauth/authorize");
            url.searchParams.set("client_id", "uniquefilter");
            url.searchParams.set("response_type", "code");
            url.searchParams.set("scope", "account:profile account:stashes account:item_filter")
            url.searchParams.set("redirect_uri", "https://uniquefilter.dev/oauth2callback");
            url.searchParams.set("state", state);
            url.searchParams.set("prompt", "consent");
            window.location = url.toString();
        });
    } else {
        // hide authorization button
        document.getElementById("authorize-poe-button").style.display = "none";
    }
}

function isAuthorized() {
    let accessData = getPoeAccessData();
    return (accessData.token != null && !accessTokenExpired());
}

function getPoeAccessData() {
    return {
        token: window.localStorage.getItem("poe-access-token"),
        expiry: Number(window.localStorage.getItem("poe-access-token-expiry")),
        refreshToken: window.localStorage.getItem("poe-refresh-token"),
    };
}

function setPoeAccessData(token, expiry, refreshToken) {
    window.localStorage.setItem("poe-access-token", token);
    window.localStorage.setItem("poe-access-token-expiry", expiry);
    window.localStorage.setItem("poe-refresh-token", refreshToken);
}

function accessTokenExpired() {
    const expiry = getPoeAccessData().expiry;
    const expiryValid = expiry !== null && expiry !== undefined && expiry > 0;
    // If the expiry date is invalid, the token cannot have expired
    return expiryValid && getPoeAccessData().expiry < Date.now().valueOf();
}