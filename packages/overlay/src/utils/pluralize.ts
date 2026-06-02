/**
 * Returns the singular or plural form of a word based on the count.
 * If no plural form is provided, it defaults to the singular form with an 's' appended.
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return Math.abs(count) === 1 ? singular : plural;
}

/**
 * Returns the singular or plural form of a word based on the count, along with the count itself.
 */
export function pluralizeWithCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
