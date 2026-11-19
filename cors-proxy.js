import {URL} from "url";
import {USER_AGENT} from "./user-agent.js";

/**
 * Build the error object sent to the client from PoE's error body
 * ({error: {code, message, fields?: [{field, message}]}}). PoE's message is about the
 * caller's own request (e.g. which filter line failed validation), so it goes back to
 * the client. Only these whitelisted fields are copied, as bounded strings. Node's own
 * error (stack, request options) is never forwarded. If there's no parseable PoE body
 * (network failure, HTML error page), the client gets a generic message.
 * @param {string|undefined} body
 * @param {number} statusCode
 * `origin: 'poe'` marks text that PoE wrote, so the UI can tell it apart from the
 * proxy's own errors ("Invalid filter ID", the generic fallback).
 * @returns {{origin?: 'poe', code: (number|null), message: string, fields?: {field: string, message: string}[]}}
 */
function extractPoeError(body, statusCode) {
    const str = (v, max) => String(v ?? '').slice(0, max);
    let parsed = null;
    try {
        parsed = JSON.parse(body);
    } catch { /* not JSON, or no body */ }
    const poeError = parsed?.error;
    // PoE's OAuth layer (e.g. an expired token) answers in the OAuth format instead:
    // {error: "invalid_token", error_description: "The access token provided is ..."}.
    if (typeof poeError === 'string' && poeError !== '') {
        return {origin: 'poe', code: null, message: str(parsed.error_description || poeError, 2000)};
    }
    if (!poeError || typeof poeError !== 'object') {
        return {code: null, message: statusCode >= 500 ? 'External service error' : 'Request failed'};
    }
    const result = {
        origin: 'poe',
        code: Number.isFinite(poeError.code) ? poeError.code : null,
        message: str(poeError.message, 2000) || 'Request failed',
    };
    if (Array.isArray(poeError.fields)) {
        result.fields = poeError.fields.slice(0, 20).map(f => ({
            field: str(f?.field, 100),
            message: str(f?.message, 500),
        }));
    }
    return result;
}

export default {
    /**
     * Forward a filter update to PoE. Browsers can't send it directly because PoE's
     * CORS policy doesn't allow a POST with a JSON body.
     * @param {import("http").IncomingMessage} req
     * @param {object} body parsed JSON request body
     * @param {import("http").ServerResponse} res
     * @returns {Promise<void>}
     */
    async updateFilter(req, body, res){
        let url = new URL(req.url, "http://dum.my/");
        let id = url.searchParams.get("id");

        // Validate filter ID
        if (!id || typeof id !== 'string' || id.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
            console.error(`Invalid filter ID attempt: ${id} from ${req.connection.remoteAddress}`);
            res.writeHead(400, {"Content-Type": "application/json"});
            res.end(JSON.stringify({error: "Invalid filter ID"}));
            return;
        }

        // Restrict the Authorization header we forward to PoE: it must look like an
        // opaque bearer token (Bearer prefix, URL-safe charset, plausible length). This
        // doesn't authenticate the caller — anyone with a valid PoE token can still
        // use the proxy — but it stops the endpoint from being a generic
        // "forward arbitrary headers to PoE" relay and blocks header-injection attempts.
        const authorizationToken = req.headers.authorization;
        if (typeof authorizationToken !== 'string' || !/^Bearer [A-Za-z0-9_\-.=]{16,200}$/.test(authorizationToken)) {
            console.error(`Malformed Authorization header from ${req.connection.remoteAddress}`);
            res.writeHead(401, {"Content-Type": "application/json"});
            res.end(JSON.stringify({error: "Missing or malformed Authorization header"}));
            return;
        }

        const endpoint = new URL("https://api.pathofexile.com/item-filter/" + id);
        endpoint.searchParams.set("validate", "true");
        let response, responseBody;
        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Authorization": authorizationToken,
                    "Content-Type": "application/json",
                    "User-Agent": USER_AGENT,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30_000),
            });
            responseBody = await response.text();
        } catch (error) {
            // Network failure or timeout: no PoE response to pass on.
            console.error('PoE API request failed:', error.message);
            res.writeHead(502, {"Content-Type": "application/json"});
            res.end(JSON.stringify({error: extractPoeError(undefined, 502)}));
            return;
        }

        if (response.ok) {
            // Pass the body through unmodified so the client gets PoE's JSON document as is.
            res.writeHead(response.status, {"Content-Type": response.headers.get("content-type") ?? "application/json"});
            res.end(responseBody);
            return;
        }

        // Log PoE's body server-side too, so a rejection can be debugged from the journal.
        // Capped: a Cloudflare block page is several KB of HTML.
        console.error('PoE API error: HTTP', response.status, '- body:', responseBody.slice(0, 2000) || '<none>');
        const headers = {"Content-Type": "application/json"};
        // On 429 the client waits Retry-After seconds (ensureOk in
        // poe-api-interface.js). Without it, it falls back to a guessed 60s.
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter && /^\d{1,6}$/.test(retryAfter)) {
            headers["Retry-After"] = retryAfter;
        }
        res.writeHead(response.status, headers);
        res.end(JSON.stringify({error: extractPoeError(responseBody, response.status)}));
    }
}