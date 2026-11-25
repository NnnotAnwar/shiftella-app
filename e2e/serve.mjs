// Serves the E2E build (dist-e2e: the real app + the fake Supabase from
// tools/screenshots) like the edge Caddy serves the real one: SPA fallback and
// the ENFORCED Content-Security-Policy taken verbatim from
// deploy/hetzner/shiftella.caddy. Every E2E test therefore also proves the app
// runs under the production CSP (the fixture fails a test on any violation).
//
//   node e2e/serve.mjs            (port E2E_PORT, default 4173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-e2e');
const port = Number(process.env.E2E_PORT ?? 4173);

/** The CSP of the `shiftella_spa` snippet, with {args[1]} = the preprod Supabase ref. */
export function cspFromCaddy(ref = 'fusnqxykhdzcvhqbsevb') {
    const caddy = readFileSync(path.join(root, 'deploy/hetzner/shiftella.caddy'), 'utf8');
    const m = caddy.match(/^\s*header \{args\[2\]\} "([^"]+)"/m);
    if (!m) throw new Error('No CSP header line found in deploy/hetzner/shiftella.caddy');
    return m[1].replaceAll('{args[1]}', ref);
}

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml',
};

async function fileFor(urlPath) {
    const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
    const candidate = path.join(dist, clean);
    if (!candidate.startsWith(dist)) return null;
    try {
        if ((await stat(candidate)).isFile()) return candidate;
    } catch {
        /* not a file */
    }
    return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const csp = cspFromCaddy();
    createServer(async (req, res) => {
        const { pathname } = new URL(req.url ?? '/', 'http://localhost');
        let file = await fileFor(pathname);
        // Like Caddy: a missing hashed asset is a real 404, never index.html.
        if (!file && pathname.startsWith('/assets/')) {
            res.writeHead(404).end();
            return;
        }
        file ??= path.join(dist, 'index.html');
        try {
            const body = await readFile(file);
            res.writeHead(200, {
                'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
                'Content-Security-Policy': csp,
                'Cache-Control': 'no-cache',
            });
            res.end(body);
        } catch {
            res.writeHead(500).end('dist-e2e missing — run `corepack yarn e2e:build`');
        }
    }).listen(port, '127.0.0.1', () => console.log(`E2E build on http://127.0.0.1:${port} (CSP enforced)`));
}
