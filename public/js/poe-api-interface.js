'use strict';

import {PoeApiAuth} from "./poe-api-auth.js";
import {Stash, StashList} from "./stash.js";

export class RateLimitError extends Error {
    constructor(timeToWait, ...params) {
        super(...params);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RateLimitError);
        }
        this.name = 'RateLimitError';
        this.timeToWait = timeToWait;
    }
}

class PoeApi {
    static isPaused = false;
    static #wait = (seconds = 1) => new Promise((r) => setTimeout(r, seconds * 1000));

    constructor() {
        if (!PoeApi.instance) {
            PoeApiAuth.handleAuthorization();
            if(!PoeApiAuth.isAuthorized()){
                return;
            }
            this.accessToken = PoeApiAuth.getPoeAccessData().token;
            this.rateLimitPolicies = {stash: 'stash-request-limit', none : ''};

            if(window.localStorage.getItem("rateLimitInfo") === null){
                window.localStorage.setItem("rateLimitInfo", JSON.stringify({}));
            }

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
        while (PoeApi.isPaused) {
            await PoeApi.#wait(1);
        }

        let baseURL = 'https://api.pathofexile.com';
        let url = new URL(baseURL + endpoint);
        url.search = new URLSearchParams(queryParameters).toString();

        const timeToWait = this.#needToWaitDueToRateLimit(rateLimitPolicy);
        if (timeToWait > 0) {
            throw new RateLimitError(timeToWait);
        }

        const headers = {};
        if (authenticated) {
            headers['Authorization'] = 'Bearer ' + this.accessToken;
        }

        const response = await fetch(url.toString(), { headers });
        this.#updateRateLimitInfo(response.headers);
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

        return await response.json();
    }

    async #getProxiedPoeApiData(endpoint, queryParameters = {}) {
        const url = new URL(endpoint, window.location.origin);
        url.search = new URLSearchParams(queryParameters).toString();
        const response = await fetch(url.toString());
        return await response.json();
    }

    isReady(){
        return PoeApiAuth.isAuthorized();
    }

    /**
     * Keep track of the rate limit information provided by poe-API's response headers to avoid running into rate limit
     * @param {Headers} responseHeaders
     */
    #updateRateLimitInfo(responseHeaders) {
        let keys = ['x-rate-limit-rules', 'x-rate-limit-policy'];
        let rules = responseHeaders.get(keys[0]);
        if (rules !== null) {
            rules = rules.toLowerCase();
            keys.push('x-rate-limit-' + rules, 'x-rate-limit-' + rules + '-state');

            let policy = responseHeaders.get(keys[1]);

            let rateLimitInfo = {};
            rateLimitInfo[policy] = {
                limits: responseHeaders.get(keys[2]),
                state: responseHeaders.get(keys[3]),
                timestamp: new Date().getTime()
            };
            let retryAfter = responseHeaders.get('retry-after');
            if (retryAfter !== null) {
                // getTime returns ms, retry-after contains seconds, so conversion is needed
                retryAfter = new Date().getTime() + (Number(retryAfter) * 1000);
                rateLimitInfo[policy]['retry-after'] = retryAfter;
            }
            window.localStorage.setItem("rateLimitInfo", JSON.stringify(rateLimitInfo));
        }
    }

    #needToWaitDueToRateLimit(policy) {
        let info = JSON.parse(window.localStorage.getItem("rateLimitInfo"))[policy];
        // if no information exists for the specified policy, this is probably the first request so we dont have to wait
        if(info === undefined || info === null) {
            return 0;
        }
        let timestamp = info.timestamp;

        // limits and state are strings in the following format: '15:10:60,30:300:300',
        // where ',' delimits different rules, each of which consists of three numbers,
        // the first number being the maximum allowed requests per amount of seconds represented by the second number.
        // The third number is the required wait time in case this limit is exceeded.
        // In case of state, the first number is the current number of requests made
        // in the sliding window defined by this rule.
        let limits = info.limits.split(',');
        let states = info.state.split(',');

        let ruleLimits = [];
        let ruleStates = [];

        limits.forEach(limit => {ruleLimits.push(parseRule(limit));});
        states.forEach(state => {ruleStates.push(parseRule(state));});

        let waitTimes = [];
        ruleStates.forEach((state, index) => {
            waitTimes.push(calcWaitingTimeForRule(state, ruleLimits[index]));
        });

        return Math.max(... waitTimes);

        function parseRule(ruleString){
            let strings = ruleString.split(':');
            return {
                maxOrCurrent: Number(strings[0]),
                timePeriod: Number(strings[1]),
                waitTime: Number(strings[2]),
                timestamp: timestamp
            };
        }

        function calcWaitingTimeForRule(state, limit){
            let current = state.maxOrCurrent;
            let max = limit.maxOrCurrent;

            // Convert ms timestamps to s
            let now = Math.ceil(Date.now() / 1000);
            let backThen = Math.ceil(state.timestamp / 1000);
            // if the limit was exceeded, wait for the time specified by the server
            if(state.waitTime > 0){
                return (backThen + state.waitTime - now) + 1;
            }
            else if(current < max){
                return 0; // don't need to wait if limit is not yet reached
            }
            else if (current === max){
                // if the limit was reached with the previous request, assume that all request were made at the very end
                // of the sliding window, and wait for the full window width to be on the safe side
                return (backThen + limit.timePeriod - now) + 1;
            }
            // if the limit was exceeded somehow, wait for the 'penalty' wait time specified in the rule
            else return limit.waitTime;
        }
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