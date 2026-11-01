/** A program to run, with its arguments and the variables to add to the inherited environment. */
export interface Invocation {
  readonly args: readonly string[];
  readonly command: string;
  readonly env: Readonly<Record<string, string>>;
}
