import http from 'node:http';

/** A response read in full. */
export interface HttpResponse {
  readonly body: Buffer;
  readonly contentType: string | undefined;
  readonly status: number;
}

/**
 * POSTs `body` as JSON to an `http:` URL and reads the whole response, failing when `signal` aborts. It uses
 * `node:http`, which has no default header timeout, because a server may take minutes before it answers.
 */
export async function postJson(url: string, body: unknown, signal: AbortSignal): Promise<HttpResponse> {
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        headers: { 'content-length': Buffer.byteLength(payload), 'content-type': 'application/json' },
        method: 'POST',
        signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => {
          resolve({
            body: Buffer.concat(chunks),
            contentType: response.headers['content-type'],
            status: response.statusCode ?? 0,
          });
        });
      },
    );
    request.once('error', reject);
    request.end(payload);
  });
}
