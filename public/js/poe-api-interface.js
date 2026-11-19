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

export class NotAuthorizedError extends Error {
    constructor(message = 'PoE API call attempted before authorization') {
        super(message);
        this.name = 'NotAuthorizedError';
    }
}

// Turn an error body into one readable line. PoE (and our proxy, which forwards
// PoE's error) send {error: {code, message, fields?: [{field, message}]}}; for
// validation failures the useful part is in `fields` ("Line 7: Unknown rule type
// Set") while `message` is only "Invalid query". Some routes send {error: string}.
function describeErrorBody(parsed, response) {
    const err = parsed?.error;
    let detail;
    if (typeof err === 'string') {
        detail = err;
    } else if (err && typeof err === 'object') {
        detail = err.message || 'Unknown error';
        if (Array.isArray(err.fields) && err.fields.length > 0) {
            const fieldText = err.fields
                .map(f => (f?.field ? `${f.field}: ` : '') + (f?.message ?? ''))
                .join('; ');
            detail += ` (${fieldText})`;
        }
        if (err.code != null) detail += ` [PoE code ${err.code}]`;
    } else {
        detail = response.statusText || 'no error details in response';
    }
    return `HTTP ${response.status}: ${detail}`;
}

// Throw a useful Error when fetch returns a non-2xx response. The message carries
// the HTTP status and PoE's own error text so a user's screenshot is enough to debug.
// 429 maps to RateLimitError so existing retry logic can resume.
async function ensureOk(response) {
    if (response.ok) return;
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* ignore */ }
    let parsed = null;
    try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* not JSON */ }
    const message = describeErrorBody(parsed, response);
    if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after')) || 60;
        throw new RateLimitError(retryAfter, message);
    }
    throw new Error(message);
}

const wait = (seconds = 1) => new Promise((r) => setTimeout(r, seconds * 1000));

class PoeApi {
    // Auth state is read per-call (via the accessToken getter and #requireAuthorized)
    // rather than cached on the instance, so a fresh token after a refresh is picked
    // up without re-instantiating, and there's no half-initialized state to guard.
    rateLimitPolicies = { stash: STASH_POLICY, none: '' };

    get accessToken() {
        return PoeApiAuth.getPoeAccessData().token;
    }

    isReady() {
        return PoeApiAuth.isAuthorized();
    }

    #requireAuthorized() {
        if (!PoeApiAuth.isAuthorized()) {
            throw new NotAuthorizedError();
        }
    }

    async getLeagues() {
        const leagues = await this.#getProxiedPoeApiData('/api/leagues');
        return leagues.filter(league => league.realm === 'pc' && !league.event);
    }

    async getAccountStashes(league) {
        this.#requireAuthorized();
        return new StashList(league, await this.#getPoeApiData('/stash/' + league, this.rateLimitPolicies.stash));
    }

    async getStashDetail(league, id) {
        this.#requireAuthorized();
        return await this.#getPoeApiData('/stash/' + league + '/' + id, this.rateLimitPolicies.stash)
    }

    async getAccountItemFilters(){
        this.#requireAuthorized();
        let response = await this.#getPoeApiData('/item-filter', this.rateLimitPolicies.none);
        return response.filters;
    }

    async getItemFilter(filterId){
        this.#requireAuthorized();
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

    async updateItemFilter(filter) {
        this.#requireAuthorized();
        let data = {
            filter: filter.filter,
            version: filter.version,
            description: filter.description
        };
        return await this.#postPoeApiData('/update-filter', data, {id: filter.id});
    }
}

const instance = new PoeApi();
export default instance;
