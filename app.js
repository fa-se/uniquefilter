'use strict';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';
import got from 'got';

import poeAuth from './poe-auth.js';
import corsProxy from "./cors-proxy.js";
import { updateUniqueLists } from './poe-uniques-updater.js';

const __dirname = new URL('.', import.meta.url).pathname;
const hostname = '127.0.0.1';
const port = 8080;
const publicDirectory = path.join(__dirname, 'public');
const leaguesCachePath = path.join(__dirname, 'leagues.json');

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    'default': 'text/plain; charset=utf-8',
};

async function getCachedLeagues() {
    try {
        const data = await fs.promises.readFile(leaguesCachePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // Return empty array if file doesn't exist
        }
        throw error;
    }
}

async function checkForNewLeagues(leaguesFromApi) {
    const cachedLeagues = await getCachedLeagues();
    const cachedLeagueIds = new Set(cachedLeagues.map(l => `${l.id}|${l.realm}`));
    
    const newLeagues = leaguesFromApi.filter(league => 
        !league.event && !cachedLeagueIds.has(`${league.id}|${league.realm}`)
    );

    if (newLeagues.length > 0) {
        console.log(`New leagues detected: ${newLeagues.map(l => `${l.id}|${l.realm}`).join(', ')}. Triggering update of unique lists.`);
        await updateUniqueLists();
        
        const allLeagues = [...cachedLeagues, ...newLeagues];

        await fs.promises.writeFile(leaguesCachePath, JSON.stringify(allLeagues, null, 2));
        console.log("leagues.json updated.");
    }
}

function serveFile(filePath, response) {
    const fileExtension = path.extname(filePath);
    const mimeType = contentTypes[fileExtension] || contentTypes.default;

    fs.createReadStream(filePath)
        .on('open', function () {
            response.setHeader('Content-Type', mimeType);
            response.statusCode = 200;
            this.pipe(response);
        })
        .on('error', function (err) {
            response.setHeader('Content-Type', 'text/plain; charset=utf-8');
            if (err.code === 'ENOENT') {
                response.statusCode = 404;
                response.end(`404 Not Found: ${filePath}`);
            } else {
                response.statusCode = 500;
                response.end(`500 Internal Server Error: ${err.message}`);
            }
        });
}

const server = http.createServer(async (request, response) => {
    console.log(new Date().toISOString(), request.method, request.url);
    let url;
    try {
        url = new URL(request.url, `https://${hostname}`);
    } catch {
        response.statusCode = 400;
        response.end('Bad Request');
        return;
    }

    const pathname = url.pathname;

    if (pathname === '/') {
        serveFile(path.join(publicDirectory, 'html', 'main.html'), response);
    } else if (pathname === '/oauth2callback') {
        response.setHeader("Content-Type", contentTypes['.json']);
        poeAuth.requestTokenCallback(url, response)
            .then(() => response.end())
            .catch(error => {
                response.statusCode = 500;
                response.end(JSON.stringify(error));
            });
    } else if (pathname === '/update-filter') {
        let buffer = [];
        for await (const chunk of request) {
            buffer.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(buffer).toString());
        await corsProxy.updateFilter(request, body, response);
    } else if (pathname === '/api/leagues') {
        try {
            const poeApiResponse = await got('https://www.pathofexile.com/api/trade/data/leagues').json();
            await checkForNewLeagues(poeApiResponse.result);
            response.setHeader('Content-Type', contentTypes['.json']);
            response.statusCode = 200;
            response.end(JSON.stringify(poeApiResponse));
        } catch (error) {
            console.error("Error handling /api/leagues:", error);
            // If we fail to get data from PoE API, we can still serve from cors-proxy as a fallback
            // to not break the client completely.
            try {
                await corsProxy.getLeagues(request, response);
            } catch (proxyError) {
                console.error("Fallback to corsProxy also failed:", proxyError);
                response.statusCode = 500;
                response.end('Internal Server Error');
            }
        }
    } else {
        // Serve static files from the public directory
        const filePath = path.join(publicDirectory, pathname);

        // Security: Ensure the resolved path is within the public directory
        if (path.resolve(filePath).indexOf(publicDirectory) !== 0) {
            response.statusCode = 403;
            response.end('403 Forbidden');
            return;
        }
        serveFile(filePath, response);
    }
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
