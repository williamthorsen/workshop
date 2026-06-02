export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return Math.abs(count) === 1 ? singular : plural;
}

export function pluralizeWithCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
