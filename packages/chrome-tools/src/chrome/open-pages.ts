import { quoteBashArgument } from '../portable/shell-quote.ts';
import { type Invocation, refuse } from './invocation.ts';

/**
 * Opens each page in order as a background target, stopping at the first that fails, so that the tabs never have a gap
 * in the middle of their order. The browser stays running after a refusal.
 */
export async function openPages(
  invocation: Invocation,
  profile: string,
  port: string,
  pages: readonly string[],
): Promise<void> {
  const { name } = invocation.output;
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
          `The browser is running; open the page again: ${name} --profile ${profile} ${quoteBashArgument(page)}`,
          `Check its state: ${name} status ${profile}`,
        ],
      },
    );
  }
}
