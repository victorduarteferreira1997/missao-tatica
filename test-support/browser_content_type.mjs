import {extname} from 'node:path';

// Os navegadores rejeitam CSS servido como application/octet-stream.
export function browserFixtureContentType(path) {
    return {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.json': 'application/json; charset=utf-8',
    }[extname(path)] || 'application/octet-stream';
}
