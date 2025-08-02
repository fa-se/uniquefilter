import secrets from "./secrets.js";
import {URL} from "url";
import got from "got";

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
        
        let authorizationToken = req.headers.authorization;

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
                //const responseData = JSON.parse(response.body);
                res.writeHead(response.statusCode, {"Content-Type": response.headers["content-type"]});
                res.end(JSON.stringify(response.body))
            }
            catch (error) {
                console.error('PoE API error:', error.message);
                const statusCode = error.response?.statusCode || 500;
                res.writeHead(statusCode, {"Content-Type": "application/json"});
                
                // Sanitize error response - don't expose detailed API errors
                const sanitizedError = {
                    error: statusCode >= 500 ? 'External service error' : 'Request failed',
                    code: statusCode
                };
                res.end(JSON.stringify(sanitizedError));
            }
        });
    }
}