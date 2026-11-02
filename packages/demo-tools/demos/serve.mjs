// Serves the deck, the fixture, and the inner demo's output to the aidemo storyboards in this directory.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8_787);

const ROOTS = {
  '/deck/': path.join(import.meta.dirname, 'agent-records-demo/deck'),
  '/fixture/': path.join(import.meta.dirname, 'fixture'),
  '/media/': path.join(import.meta.dirname, 'sample-tour/output'),
};

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.mp4': 'video/mp4',
  '.srt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
};

const server = createServer((request, response) => {
  const file = resolveFile(new URL(request.url ?? '/', `http://${HOST}`).pathname);
  if (file === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n');
    return;
  }

  serveFile(file, request, response);
});

server.listen(PORT, HOST, () => {
  console.info(`Serving the demos on http://${HOST}:${PORT}/`);
});

// region | Helpers

/** Reports whether a path names a regular file. */
function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Parses a single-range `Range` header against a file size, as Chrome sends it for a `<video>`. */
function parseRange(header, size) {
  const [, first = '', last = ''] = /^bytes=(\d*)-(\d*)$/.exec(header ?? '') ?? [];
  const start = first === '' ? Math.max(size - Number(last), 0) : Number(first);
  const end = first === '' || last === '' ? size - 1 : Math.min(Number(last), size - 1);
  const isValid = (first !== '' || last !== '') && start <= end;
  return isValid ? { end, start } : undefined;
}

/** Maps a request path to a file under one of the roots, refusing a path that escapes its root or cannot be decoded. */
function resolveFile(pathname) {
  const prefix = Object.keys(ROOTS).find((candidate) => pathname.startsWith(candidate));
  const file = prefix === undefined ? undefined : resolveUnderRoot(ROOTS[prefix], pathname.slice(prefix.length));
  return file !== undefined && isFile(file) ? file : undefined;
}

/** Resolves a URL-encoded path against a root, returning nothing for a path outside it or a malformed escape. */
function resolveUnderRoot(root, encoded) {
  let relative;
  try {
    relative = decodeURIComponent(encoded) || 'index.html';
  } catch {
    relative = '';
  }

  const file = path.resolve(root, relative);
  const isInside = relative !== '' && file.startsWith(root + path.sep);
  return isInside ? file : undefined;
}

/** Streams a file, answering a byte-range request with 206 so that a `<video>` can seek. */
function serveFile(file, request, response) {
  const { size } = statSync(file);
  const headers = {
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
  };

  const range = request.headers.range === undefined ? undefined : parseRange(request.headers.range, size);
  if (request.headers.range !== undefined && range === undefined) {
    response.writeHead(416, { 'content-range': `bytes */${size}` }).end();
    return;
  }

  if (range === undefined) {
    response.writeHead(200, { ...headers, 'content-length': size });
    createReadStream(file).pipe(response);
    return;
  }

  response.writeHead(206, {
    ...headers,
    'content-length': range.end - range.start + 1,
    'content-range': `bytes ${range.start}-${range.end}/${size}`,
  });
  createReadStream(file, range).pipe(response);
}

// endregion | Helpers
