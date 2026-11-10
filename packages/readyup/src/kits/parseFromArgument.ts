import { usageError } from '../errors/RdyError.ts';
import { InvalidFromValueError } from './InvalidFromValueError.ts';
import { type FromSource, parseFromValue } from './parseFromValue.ts';

/** Parses a `--from` flag value, reporting a rejected one as a usage error and letting any other failure propagate. */
export function parseFromArgument(
  fromValue: string,
  parse: (value: string) => FromSource = parseFromValue,
): FromSource {
  try {
    return parse(fromValue);
  } catch (error: unknown) {
    if (!(error instanceof InvalidFromValueError)) throw error;
    throw usageError(error.message, { cause: error });
  }
}
