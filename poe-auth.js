import got from 'got';
import secrets from './secrets.js'
import * as querystring from "querystring";

const client_id = "uniquefilter";

export default {
    /**
     * Gets called by POE server after user authorization.
     * @param {import("url").URL} url
     * @param {import("http").ServerResponse} res
     * @returns {Promise}
     */
    requestTokenCallback: function (url, res) {
        let urlParameters = url.searchParams;
        return new Promise(async (resolve, reject) => {
            try {
                const response = await got.post('https://pathofexile.com/oauth/token', {
                    form: {
                        code: urlParameters.get('code'),
                        redirect_uri: "http://127.0.0.1:8080/oauth2callback",
                        grant_type: "authorization_code",
                        client_id: client_id,
                        client_secret: secrets.client_secret,
                        scope: 'account:profile account:stashes account:item_filter'
                    }
                });
                const responseData = JSON.parse(response.body);
                res.statusCode = 301;
                res.setHeader("Location", "/?" + querystring.stringify(responseData));
                resolve(responseData);
            }
            catch (error) {
                console.log(error);
                reject(error);
            }
        });
        }
}