'use strict';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';

import poeAuth from './poe-auth.js'

const __dirname = new URL('.', import.meta.url).pathname;
const hostname = '127.0.0.1';
const port = 8080;
const baseDirectory = __dirname + 'public';

const contentTypes = {
    html: 'text/html',
    js: 'text/javascript',
    css: 'text/css',
    json: 'application/json',
    default: 'text/plain',
};
// Encoding für alle contentTypes (bis jetzt nur Text) setzen:
Object.keys(contentTypes).forEach((key) => {
    contentTypes[key] += '; charset=utf-8';
});

const server = http.createServer((request, response) => {
    let url = new URL(request.url, 'https://' + hostname + '/');
    let fileName = path.join(baseDirectory, url.pathname);
    if(fileName.indexOf(baseDirectory) !== 0){  // check if requested path is escaping the web root
        response.statusCode = 403;
        response.end('403');
        return;
    }
    else switch (url.pathname) {
        case '/':
            let filePath = baseDirectory + '/html/main.html';
            streamFile(filePath, response);
            break;
        case '/js/main.js':
        case '/js/client_app.js':
        case '/css/style.css':
            streamFile(baseDirectory + request.url, response);
            break;
        case '/oauth2callback':
            response.setHeader("Content-Type", contentTypes["json"]);
            poeAuth.requestTokenCallback(url, response)
                .then(() => {
                    response.end();
                })
                .catch(error => {
                    response.statusCode = 500;
                    response.end(JSON.stringify(error));
                });
            break;
        default:
            response.setHeader('Content-Type', contentTypes.default);
            response.statusCode = 404;
            response.write(request.url);
            response.write('\n');
            response.end('404');
            return;
    }
});

server.listen(port, hostname, () => {
    console.log(`Server running at https://${hostname}:${port}/`);
});

function streamFile(path, response) {
    // deduct MIME-type from file extension
    let fileExtension = path.split('.').pop();
    let mimeType = Object.keys(contentTypes).includes(fileExtension)
        ? contentTypes[fileExtension]
        : contentTypes.default;

    let fileStream = fs.createReadStream(path);
    // stream file if possible
    fileStream.on('open', function () {
        response.setHeader('Content-Type', mimeType);
        response.statusCode = 200;
        fileStream.pipe(response);
    });
    // handle errors opening/streaming the file
    fileStream.on('error', function () {
        if (!fs.existsSync(path)) {
            response.statusCode = 404;
        } else {
            response.statusCode = 500;
        }
        response.setHeader('Content-Type', 'text/plain');
        response.end(String(response.statusCode));
    });
}