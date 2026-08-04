/**
 * A remote fetch that answered with a failing HTTP status.
 *
 * Carries the status so a boundary can decide what the failure means without re-parsing the message.
 * A transport failure and a malformed body are not this error: neither has a status to reason about.
 */
export class RemoteFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RemoteFetchError';
    this.status = status;
  }
}
