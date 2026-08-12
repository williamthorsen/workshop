import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunHumanMode = vi.hoisted(() => vi.fn());
const mockRunJsonMode = vi.hoisted(() => vi.fn());

// Both modes are mocked: what the dispatch owns is the choice between them and the settings it hands over,
// and each mode's own behavior is covered by the suite named for it.
vi.mock(import('../runHumanMode.ts'), () => ({
  runHumanMode: mockRunHumanMode,
}));

vi.mock(import('../runJsonMode.ts'), () => ({
  runJsonMode: mockRunJsonMode,
}));

import { runCommand } from '../runCommand.ts';
import { singleKitEntry } from '../test-utils/kit-fixtures.ts';

describe(runCommand, () => {
  beforeEach(() => {
    mockRunHumanMode.mockResolvedValue(0);
    mockRunJsonMode.mockResolvedValue(0);
  });

  afterEach(() => {
    mockRunHumanMode.mockReset();
    mockRunJsonMode.mockReset();
  });

  it('sends a JSON run to the JSON mode alone', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true });

    expect(mockRunJsonMode).toHaveBeenCalledTimes(1);
    expect(mockRunHumanMode).not.toHaveBeenCalled();
  });

  it('sends every other run to the human mode alone', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false });

    expect(mockRunHumanMode).toHaveBeenCalledTimes(1);
    expect(mockRunJsonMode).not.toHaveBeenCalled();
  });

  it('hands the mode the entries it was given', async () => {
    const kitEntries = singleKitEntry(['deploy']);

    await runCommand({ kitEntries, json: false });

    expect(mockRunHumanMode).toHaveBeenCalledWith(kitEntries, expect.anything(), false);
  });

  it('resolves an unrequested detail to the full report', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true });

    expect(mockRunJsonMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ detail: 'full' }), false);
  });

  it('passes the detail the invocation requested through', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true, detail: 'summary' });

    expect(mockRunJsonMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: 'summary' }),
      false,
    );
  });

  it('resolves an unrequested quiet to a loud run', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false });

    expect(mockRunHumanMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quiet: false }), false);
  });

  it('passes the quiet the invocation requested through', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, quiet: true });

    expect(mockRunHumanMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quiet: true }), false);
  });

  it('carries the thresholds the invocation named through to the mode', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, failOn: 'warn', reportOn: 'error' });

    expect(mockRunHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failOn: 'warn', reportOn: 'error' }),
      false,
    );
  });

  it('reports a run as not just-in-time unless told it is', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false });

    expect(mockRunHumanMode).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
  });

  it('carries a just-in-time run through to the mode', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true }, true);

    expect(mockRunJsonMode).toHaveBeenCalledWith(expect.anything(), expect.anything(), true);
  });

  it('returns the exit code the mode resolved', async () => {
    mockRunHumanMode.mockResolvedValue(2);

    const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false });

    expect(exitCode).toBe(2);
  });
});
