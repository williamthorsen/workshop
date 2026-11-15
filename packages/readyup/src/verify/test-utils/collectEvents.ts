/** A drained generator's yielded values alongside the value that it returned. */
export interface CollectedEvents<Event, Result> {
  events: Event[];
  result: Result;
}

/** Drains an async generator, returning every value that it yielded and the value that it returned. */
export async function collectEvents<Event, Result>(
  generator: AsyncGenerator<Event, Result>,
): Promise<CollectedEvents<Event, Result>> {
  const events: Event[] = [];
  for (;;) {
    const step = await generator.next();
    if (step.done === true) return { events, result: step.value };
    events.push(step.value);
  }
}
