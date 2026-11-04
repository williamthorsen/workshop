/** Reports whether an answer confirms: `y` or `yes`, in any case. */
export function isAffirmative(answer: string | undefined): boolean {
  const normalized = answer?.trim().toLowerCase();

  return normalized === 'y' || normalized === 'yes';
}
