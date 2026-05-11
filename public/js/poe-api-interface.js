'use strict';

import {PoeApiAuth} from "./poe-api-auth.js";
import {Stash, StashList} from "./stash.js";
import {
    RateLimitError,
    STASH_POLICY,
    computeWaitSeconds,
    isPaused,
    updateRateLimitInfoFromHeaders
} from "./rate-limit.js";

// Re-export so callers don't need to know rate-limit.js exists yet (utils.js does
// the right thing by importing from rate-limit.js directly).
export { RateLimitError } from "./rate-limit.js";

// Throw a useful Error when fetch returns a non-2xx response. PoE returns JSON
// errors as {error: {code, message}}; our own proxy returns {error: string, code}.
// 429 maps to RateLimitError so existing retry logic can resume.
async function ensureOk(response) {
    if (response.ok) return;
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* ignore */ }
    let parsed = null;
    try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* not JSON */ }
    const message =
        parsed?.error?.message ??
        (typeof parsed?.error === 'string' ? parsed.error : null) ??
        `HTTP ${response.status} ${response.statusText}`;
    if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after')) || 60;
        throw new RateLimitError(retryAfter, message);
    }
    throw new Error(message);
}

const wait = (seconds = 1) => new Promise((r) => setTimeout(r, seconds * 1000));

class PoeApi {
    constructor() {
        if (!PoeApi.instance) {
            PoeApiAuth.handleAuthorization();
            if(!PoeApiAuth.isAuthorized()){
                return;
            }
            this.accessToken = PoeApiAuth.getPoeAccessData().token;
            this.rateLimitPolicies = {stash: STASH_POLICY, none : ''};

            PoeApi.instance = this;
        }
        return PoeApi.instance;
    }

    async getLeagues() {
        const leagues = await this.#getProxiedPoeApiData('/api/leagues');
        return leagues.filter(league => league.realm === 'pc' && !league.event);
    }

    async getAccountStashes(league) {
        return new StashList(league, await this.#getPoeApiData('/stash/' + league, this.rateLimitPolicies.stash));
    }

    async getStashDetail(league, id) {
        return await this.#getPoeApiData('/stash/' + league + '/' + id, this.rateLimitPolicies.stash)
    }

    async getAccountItemFilters(){
        let response = await this.#getPoeApiData('/item-filter', this.rateLimitPolicies.none);
        return response.filters;
    }

    async getItemFilter(filterId){
        let response = await this.#getPoeApiData('/item-filter/' + filterId, this.rateLimitPolicies.none);
        return response.filter;
    }

    async #getPoeApiData(endpoint, rateLimitPolicy, queryParameters = {}, authenticated = true) {
        while (isPaused()) {
            await wait(1);
        }

        let baseURL = 'https://api.pathofexile.com';
        let url = new URL(baseURL + endpoint);
        url.search = new URLSearchParams(queryParameters).toString();

        const timeToWait = computeWaitSeconds(rateLimitPolicy);
        if (timeToWait > 0) {
            throw new RateLimitError(timeToWait);
        }

        const headers = {};
        if (authenticated) {
            headers['Authorization'] = 'Bearer ' + this.accessToken;
        }

        const response = await fetch(url.toString(), { headers });
        updateRateLimitInfoFromHeaders(response.headers);
        await ensureOk(response);
        return await response.json();
    }

    async #postPoeApiData(endpoint, data, queryParameters){
        // poe api CORS policy doesn't allow POST request with JSON body from the browser,
        // so the requests need to be proxied by the webserver.
        // Use a relative URL to ensure requests are sent to the same origin that served the page.
        const url = new URL(endpoint, window.location.origin);
        url.search = new URLSearchParams(queryParameters).toString();

        const response = await fetch(url.toString(), {
           method: 'POST',
           headers:{
               Authorization: 'Bearer ' + this.accessToken,
               'Content-Type': 'application/json'
           },
            body: JSON.stringify(data)
        });
        await ensureOk(response);
        return await response.json();
    }

    async #getProxiedPoeApiData(endpoint, queryParameters = {}) {
        const url = new URL(endpoint, window.location.origin);
        url.search = new URLSearchParams(queryParameters).toString();
        const response = await fetch(url.toString());
        await ensureOk(response);
        return await response.json();
    }

    isReady(){
        return PoeApiAuth.isAuthorized();
    }

    async updateItemFilter(filter) {
        let data = {
            filter: filter.filter,
            version: filter.version,
            description: filter.description
        };
        let response = await this.#postPoeApiData('/update-filter', data, {id: filter.id});

        return JSON.parse(response);
    }
}

const instance = new PoeApi();
export default instance;
