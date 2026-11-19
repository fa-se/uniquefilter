import secrets from "./secrets.js";
import {URL} from "url";
import got from "got";

/**
 * Build the error object sent to the client from PoE's error body
 * ({error: {code, message, fields?: [{field, message}]}}). PoE's message is about the
 * caller's own request (e.g. which filter line failed validation), so it goes back to
 * the client. Only these whitelisted fields are copied, as bounded strings. got's own
 * error (stack, request options) is never forwarded. If there's no parseable PoE body
 * (network failure, HTML error page), the client gets a generic message.
 * @param {string|undefined} body
 * @param {number} statusCode
 * @returns {{code: (number|null), message: string, fields?: {field: string, message: string}[]}}
 */
function extractPoeError(body, statusCode) {
    const str = (v, max) => String(v ?? '').slice(0, max);
    let poeError = null;
    try {
        poeError = JSON.parse(body)?.error;
    } catch { /* not JSON, or no body */ }
    if (!poeError || typeof poeError !== 'object') {
        return {code: null, message: statusCode >= 500 ? 'External service error' : 'Request failed'};
    }
    const result = {
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
     * Gets called by POE server after user authorization.
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @returns {Promise}
     */
    async getLeagues(req, res) {
        const endpoint = "https://api.pathofexile.com/leagues";
        return new Promise((resolve, reject) => {
            const gotStream = got.stream(endpoint);
            gotStream.on("error", (error) => {
                console.error("Error fetching leagues:", error);
                res.writeHead(500, {"Content-Type": "application/json"});
                res.end(JSON.stringify({error: "Failed to fetch leagues"}));
                reject(error);
            });
            gotStream.pipe(res);
            gotStream.on("end", () => {
                resolve();
            });
        });
    },

    /**
     * Gets called by POE server after user authorization.
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @returns {Promise}
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

        let endpoint = "https://api.pathofexile.com/item-filter/" + id;
        // console.log(endpoint);
        return new Promise(async (resolve, reject) => {
            try {
                const response = await got.post(endpoint, {
                    searchParams: {
                        validate: true
                    },
                    headers: {
                        "Authorization": authorizationToken,
                    },
                    json: body

                });
                // got returns body as a string when responseType isn't set; pass through
                // unmodified so the client gets the raw JSON document (one parse round-trip).
                res.writeHead(response.statusCode, {"Content-Type": response.headers["content-type"]});
                res.end(response.body);
            }
            catch (error) {
                // Log PoE's own body server-side: the sanitized client response below
                // deliberately drops it, and without it a validation rejection reads as
                // a bare "Response code 400" with no hint at which rule PoE disliked.
                console.error('PoE API error:', error.message, '- body:', error.response?.body ?? '<none>');
                const statusCode = error.response?.statusCode || 500;
                const headers = {"Content-Type": "application/json"};
                // On 429 the client waits Retry-After seconds (ensureOk in
                // poe-api-interface.js). Without it, it falls back to a guessed 60s.
                const retryAfter = error.response?.headers?.["retry-after"];
                if (retryAfter && /^\d{1,6}$/.test(retryAfter)) {
                    headers["Retry-After"] = retryAfter;
                }
                res.writeHead(statusCode, headers);
                res.end(JSON.stringify({error: extractPoeError(error.response?.body, statusCode)}));
            }
        });
    }
}