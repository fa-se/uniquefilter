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

// Split a PoE error object into a summary and one entry per problem. Validation
// errors come in two shapes: newer ones put each problem in `fields`
// ([{field: 'filter', message: 'Line 7: Unknown rule type Set'}]) with message
// "Invalid query"; older ones pack everything into `message`
// ("Invalid query; filter : Line 7717 : ...; Line 7886 : ...;"). Entries are
// normalized to "Line N: ...".
export function splitPoeError(err) {
    const normalize = (text) => text.trim()
        .replace(/;$/, '')
        .replace(/^(?:\w+\s*:\s*)?Line (\d+)\s*:\s*/, 'Line $1: ');
    const [summary, ...rest] = String(err?.message ?? '').split(/;\s*(?=(?:\w+\s*:\s*)?Line \d+\s*:)/);
    const items = rest.map(normalize);
    if (Array.isArray(err?.fields)) {
        for (const f of err.fields) {
            const text = normalize(String(f?.message ?? ''));
            items.push(f?.field && f.field !== 'filter' ? `${f.field}: ${text}` : text);
        }
    }
    return { summary: summary.trim().replace(/;$/, '') || 'Unknown error', items };
}

// One-line form of an error body, for the Error message and the console.
function describeErrorBody(parsed, response) {
    const err = parsed?.error;
    let detail;
    if (typeof err === 'string') {
        // OAuth format: {error: "invalid_token", error_description: "..."}
        detail = parsed.error_description || err;
    } else if (err && typeof err === 'object') {
        const { summary, items } = splitPoeError(err);
        detail = summary + (items.length > 0 ? ` (${items.join('; ')})` : '');
        if (err.code != null) detail += ` [PoE code ${err.code}]`;
    } else {
        detail = response.statusText || 'no error details in response';
    }
    return `HTTP ${response.status}: ${detail}`;
}

// A non-2xx response. `poeError` is the parsed error object (Filter reads validation
// line numbers from it). `fromPoe` says whether PoE wrote it, as opposed to our own
// server, so the UI can label it.
export class PoeApiError extends Error {
    constructor(message, status, poeError, fromPoe) {
        super(message);
        this.name = 'PoeApiError';
        this.status = status;
        this.poeError = poeError;
        this.fromPoe = fromPoe;
    }
}

// Throw a useful Error when fetch returns a non-2xx response. 429 maps to
// RateLimitError so existing retry logic can resume.
async function ensureOk(response) {
    if (response.ok) return;
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* ignore */ }
    let parsed = null;
    try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* not JSON */ }
    const err = parsed?.error;
    const message = describeErrorBody(parsed, response);
    if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after')) || 60;
        throw new RateLimitError(retryAfter, message);
    }
    const poeError = (err && typeof err === 'object') ? err : null;
    // Direct calls go to api.pathofexile.com; proxied ones are marked by cors-proxy.js.
    let fromPoe = poeError?.origin === 'poe';
    try { fromPoe ||= new URL(response.url).hostname === 'api.pathofexile.com'; } catch { /* no url */ }
    if (response.status === 401 && fromPoe) {
        // Navigates away; the throw below only stops the current call chain.
        PoeApiAuth.handleRejectedToken();
    }
    throw new PoeApiError(message, response.status, poeError, fromPoe && poeError !== null);
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
