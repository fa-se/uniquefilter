import secrets from "./secrets.js";
import {URL} from "url";
import got from "got";

export default{
    /**
     * Gets called by POE server after user authorization.
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @returns {Promise}
     */
    async updateFilter(req, body, res){
        let url = new URL(req.url, "http://dum.my/");
        let id = url.searchParams.get("id");
        // let authorizationToken = url.searchParams.get("authorization");
        let authorizationToken = req.headers.authorization;
        // console.log(authorizationToken);

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
                console.log(error);
                res.writeHead(error.response.statusCode, {"Content-Type": error.response.headers["content-type"]});
                res.end(JSON.stringify(error.response.body))
            }
        });
    }
}