'use strict';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';

import poeAuth from './poe-auth.js'
import corsProxy from "./cors-proxy.js";

const __dirname = new URL('.', import.meta.url).pathname;
const hostname = '127.0.0.1';
const port = 8080;
const publicDirectory = path.join(__dirname, 'public');

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    'default': 'text/plain; charset=utf-8',
};

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
