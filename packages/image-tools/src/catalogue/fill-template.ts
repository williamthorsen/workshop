import type { Style } from './read-catalogue.ts';

/** The placeholder in a style's templates that the subject replaces. */
export const SUBJECT_PLACEHOLDER = '{prompt}';

/** Returns a style's prompt and negative prompt with the trimmed subject in place of the placeholder. */
export function fillTemplate(style: Style, subject: string): { negativePrompt: string | undefined; prompt: string } {
  const trimmed = subject.trim();
  return {
    negativePrompt: style.negativePrompt?.replaceAll(SUBJECT_PLACEHOLDER, () => trimmed),
    prompt: style.prompt.replaceAll(SUBJECT_PLACEHOLDER, () => trimmed),
  };
}
