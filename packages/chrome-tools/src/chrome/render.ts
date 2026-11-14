import { quoteBashArgument } from '../portable/shell-quote.ts';
import type { JsonValue } from './invocation.ts';

/** Returns a count of profiles with its noun, so that a summary reads `1 profile` rather than `1 profiles`. */
export function describeProfileCount(count: number): string {
  return count === 1 ? '1 profile' : `${count} profiles`;
}

/** Returns a command line as one shell-quoted line that pastes back into a shell as the same argv. */
export function formatCommandLine(args: readonly string[]): string {
  return args.map((argument) => quoteBashArgument(argument)).join(' ');
}

/** Returns a value as JSON, writing each control character other than `\n`, `\r`, and `\t` as `\u00XX`. */
export function stringifyJson(value: JsonValue): string {
  return JSON.stringify(value).replaceAll(/\\(.)/g, (escape: string, character: string) => {
    if (character === 'b') return String.raw`\u0008`;
    if (character === 'f') return String.raw`\u000c`;
    return escape;
  });
}
