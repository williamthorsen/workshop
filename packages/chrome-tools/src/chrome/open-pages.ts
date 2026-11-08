import { type Invocation, refuse } from './invocation.ts';
import { formatCommandLine } from './render.ts';

/** Where a launch opens its pages, and the launch options that select the same instance again. */
export interface PageTarget {
  port: string;
  profile: string;
  /** Options that make a later launch select this instance, in this mode, without rewriting the profile's record. */
  relaunchOptions: readonly string[];
}

/**
 * Opens each page in order as a background target, stopping at the first that fails, so that the tabs never have a gap
 * in the middle of their order. The browser stays running after a refusal, whose hint relaunches against it.
 */
export async function openPages(invocation: Invocation, target: PageTarget, pages: readonly string[]): Promise<void> {
  const { name } = invocation.output;
  const { port, profile, relaunchOptions } = target;
  for (const page of pages) {
    const opening = await invocation.deps.openPage(port, page);
    if (opening.isOpened) continue;
    throw refuse(
      invocation,
      'page-open-failed',
      `could not open ${page} in profile '${profile}' on port ${port}: ${opening.reason}`,
      {
        extra: { url: page },
        hints: [
          `The browser is running; open the page again: ${name} ${formatCommandLine([...relaunchOptions, page])}`,
          `Check its state: ${name} status ${profile}`,
        ],
      },
    );
  }
}
