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

// Rate limiting store
const rateLimits = new Map(); // ip -> {count, resetTime}

// Security utilities
function addSecurityHeaders(response) {
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'");
}

function checkRateLimit(ip, limit = 60) {
    const now = Date.now();
    const entry = rateLimits.get(ip) || {count: 0, resetTime: now + 60000};
    
    if (now > entry.resetTime) {
        entry.count = 0;
        entry.resetTime = now + 60000;
    }
    
    if (entry.count >= limit) {
        console.error(`Rate limit exceeded for IP ${ip}: ${entry.count}/${limit} requests`);
        return false;
    }
    
    entry.count++;
    rateLimits.set(ip, entry);
    return true;
}

function validateLeagueName(name) {
    if (!name || typeof name !== 'string') return false;
    return /^[a-zA-Z0-9\s]{1,50}$/.test(name);
}

// Cleanup old rate limit entries every hour
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimits.entries()) {
        if (now > entry.resetTime) {
            rateLimits.delete(ip);
        }
    }
}, 3600000);

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
                response.end('Not Found');
            } else {
                console.error('File serving error:', err.message, 'for path:', filePath);
                response.statusCode = 500;
                response.end('Internal Server Error');
            }
        });
}

const server = http.createServer(async (request, response) => {
    console.log(new Date().toISOString(), request.method, request.url);
    
    // Get client IP
    const clientIP = request.headers['x-forwarded-for'] || request.connection.remoteAddress || 'unknown';
    
    // Apply rate limiting
    if (!checkRateLimit(clientIP)) {
        response.statusCode = 429;
        response.end('Too Many Requests');
        return;
    }
    
    // Add security headers to all responses
    addSecurityHeaders(response);
    
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
        // Stricter rate limiting for expensive operations
        if (!checkRateLimit(clientIP, 10)) { // 10 requests per minute
            response.statusCode = 429;
            response.end('Too Many Requests');
            return;
        }
        
        // Validate Content-Type
        if (!request.headers['content-type']?.includes('application/json')) {
            response.statusCode = 400;
            response.end('Invalid Content-Type');
            return;
        }

        // Request size protection
        const MAX_BODY_SIZE = 1024 * 1024; // 1MB
        let buffer = [];
        let totalSize = 0;
        
        try {
            for await (const chunk of request) {
                totalSize += chunk.length;
                if (totalSize > MAX_BODY_SIZE) {
                    console.error(`Request size limit exceeded: ${totalSize} bytes from ${request.connection.remoteAddress}`);
                    response.statusCode = 413;
                    response.end('Payload Too Large');
                    return;
                }
                buffer.push(chunk);
            }
            
            const body = JSON.parse(Buffer.concat(buffer).toString());
            await corsProxy.updateFilter(request, body, response);
        } catch (error) {
            console.error('JSON parsing error:', error.message);
            response.statusCode = 400;
            response.end('Invalid JSON');
        }
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
        const resolvedPath = path.resolve(filePath);
        const normalizedPublicDir = path.resolve(publicDirectory);
        if (!resolvedPath.startsWith(normalizedPublicDir + path.sep) && resolvedPath !== normalizedPublicDir) {
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
