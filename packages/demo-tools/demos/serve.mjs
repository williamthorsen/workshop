// Serves the deck, the fixture, and the inner demo's output to the aidemo storyboards in this directory.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream';

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
  const target = resolveFile(new URL(request.url ?? '/', `http://${HOST}`).pathname);
  if (target === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n');
    return;
  }

  serveFile(target, request, response);
});

server.listen(PORT, HOST, () => {
  console.info(`Serving the demos on http://${HOST}:${PORT}/`);
});

// region | Helpers

/** Discards the error that ends a pipeline, which is the client's abort or a file replaced during the read. */
function ignoreStreamError() {}

/** Parses a single-range `Range` header against a file size, as Chrome sends it for a `<video>`. */
function parseRange(header, size) {
  const [, first = '', last = ''] = /^bytes=(\d*)-(\d*)$/.exec(header ?? '') ?? [];
  const start = first === '' ? Math.max(size - Number(last), 0) : Number(first);
  const end = first === '' || last === '' ? size - 1 : Math.min(Number(last), size - 1);
  const isValid = (first !== '' || last !== '') && start <= end;
  return isValid ? { end, start } : undefined;
}

/** Returns the size of a regular file, or nothing for a path that is missing, unreadable, or names something else. */
function readFileSize(file) {
  let size;
  try {
    const stats = statSync(file);
    size = stats.isFile() ? stats.size : undefined;
  } catch {
    // Leave the size unset, so that the request receives a 404.
  }

  return size;
}

/**
 * Maps a request path to a regular file under one of the roots and its size, refusing a path that escapes its root or
 * cannot be decoded.
 */
function resolveFile(pathname) {
  const prefix = Object.keys(ROOTS).find((candidate) => pathname.startsWith(candidate));
  const file = prefix === undefined ? undefined : resolveUnderRoot(ROOTS[prefix], pathname.slice(prefix.length));
  const size = file === undefined ? undefined : readFileSize(file);
  return size === undefined ? undefined : { file, size };
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

/**
 * Streams a file, answering a byte-range request with 206 so that a `<video>` can seek. A read error or an aborted
 * request destroys both streams, so that a file replaced mid-request does not stop the server.
 */
function serveFile({ file, size }, request, response) {
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
    pipeline(createReadStream(file), response, ignoreStreamError);
    return;
  }

  response.writeHead(206, {
    ...headers,
    'content-length': range.end - range.start + 1,
    'content-range': `bytes ${range.start}-${range.end}/${size}`,
  });
  pipeline(createReadStream(file, range), response, ignoreStreamError);
}

// endregion | Helpers
