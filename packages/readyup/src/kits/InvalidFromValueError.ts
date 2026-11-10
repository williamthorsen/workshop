/**
 * A source value, spelled as `--from` takes it, that `parseFromValue` rejects.
 *
 * Its own class lets each caller report the rejection as the mistake that fits its context, a usage error for a flag or
 * a config error for a `sources` entry, while any other failure propagates as a defect.
 */
export class InvalidFromValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFromValueError';
  }
}
