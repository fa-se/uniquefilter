'use strict';

// Leaf module for the PoE rate-limit bookkeeping. Owns:
// - the RateLimitError type
// - a global pause flag (set by retry logic, polled by the request loop)
// - parsing rate-limit headers from PoE responses into localStorage
// - computing how long to wait / how many slots remain for a given policy
//
// Keeping this leaf (no imports from poe-api-interface, stash, utils, etc.) is
// what lets us break the utils <-> poe-api-interface <-> stash cycle.

const STORAGE_KEY = 'rateLimitInfo';

export const STASH_POLICY = 'stash-request-limit';

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

let _paused = false;
export function isPaused() { return _paused; }
export function setPaused(value) { _paused = !!value; }

// Read the (possibly corrupt or missing) rate-limit blob from localStorage.
// Returns the entry for the requested policy, or null if none. With no policy,
// returns the whole parsed object (or {} on failure).
export function readRateLimitInfo(policy) {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return policy ? null : {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return policy ? (parsed[policy] ?? null) : parsed;
        }
    } catch { /* corrupt — fall through */ }
    return policy ? null : {};
}

// Record the rate-limit state from a PoE API response. Writes one policy entry
// at a time (PoE only ever sets one policy per response).
export function updateRateLimitInfoFromHeaders(responseHeaders) {
    const rules = responseHeaders.get('x-rate-limit-rules');
    if (rules === null) return;
    const rulesLc = rules.toLowerCase();
    const policy = responseHeaders.get('x-rate-limit-policy');
    if (!policy) return;

    const entry = {
        limits: responseHeaders.get('x-rate-limit-' + rulesLc),
        state: responseHeaders.get('x-rate-limit-' + rulesLc + '-state'),
        timestamp: Date.now()
    };
    const retryAfter = responseHeaders.get('retry-after');
    if (retryAfter !== null) {
        entry['retry-after'] = Date.now() + Number(retryAfter) * 1000;
    }

    const all = readRateLimitInfo();
    all[policy] = entry;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function parseRule(ruleString, timestamp) {
    const parts = ruleString.split(':');
    return {
        maxOrCurrent: Number(parts[0]),
        timePeriod: Number(parts[1]),
        waitTime: Number(parts[2]),
        timestamp
    };
}

function calcWaitSecondsForRule(state, limit) {
    const now = Math.ceil(Date.now() / 1000);
    const backThen = Math.ceil(state.timestamp / 1000);
    // limit was exceeded — wait for the time the server told us to
    if (state.waitTime > 0) return (backThen + state.waitTime - now) + 1;
    // headroom remaining — go ahead
    if (state.maxOrCurrent < limit.maxOrCurrent) return 0;
    // limit was reached exactly with the last request — assume worst case and wait the full window
    if (state.maxOrCurrent === limit.maxOrCurrent) return (backThen + limit.timePeriod - now) + 1;
    // somehow exceeded — wait the penalty period
    return limit.waitTime;
}

// Compute how long (in seconds) we need to wait before the next request for this
// policy can safely go out. 0 means "send immediately."
export function computeWaitSeconds(policy) {
    const info = readRateLimitInfo(policy);
    if (!info || !info.limits || !info.state) return 0;
    const limits = info.limits.split(',').map(s => parseRule(s, info.timestamp));
    const states = info.state.split(',').map(s => parseRule(s, info.timestamp));
    const waits = states.map((s, i) => calcWaitSecondsForRule(s, limits[i]));
    return waits.length > 0 ? Math.max(...waits) : 0;
}

// Return how many requests are still available in the most-constrained rule for
// this policy, or Infinity if we have no rate-limit data yet.
export function getRemainingSlots(policy) {
    const info = readRateLimitInfo(policy);
    if (!info || !info.limits || !info.state) return Infinity;
    const limits = info.limits.split(',');
    const states = info.state.split(',');
    const remaining = limits.map((limit, i) => {
        const max = parseInt(limit.split(':')[0], 10);
        const current = parseInt(states[i].split(':')[0], 10);
        return max - current;
    });
    return Math.max(0, Math.min(...remaining));
}
