import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunHumanMode = vi.hoisted(() => vi.fn());
const mockRunJsonMode = vi.hoisted(() => vi.fn());

// Both modes are mocked: The dispatch owns the choice between them and the settings that it hands over.
vi.mock(import('../runHumanMode.ts'), () => ({
  runHumanMode: mockRunHumanMode,
}));

vi.mock(import('../runJsonMode.ts'), () => ({
  runJsonMode: mockRunJsonMode,
}));

import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { runCommand } from '../runCommand.ts';
import { singleKitEntry } from '../test-utils/kit-fixtures.ts';

const remote = createUncachedRemoteContext();

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
    await runCommand({ kitEntries: singleKitEntry(), json: true, remote });

    expect(mockRunJsonMode).toHaveBeenCalledTimes(1);
    expect(mockRunHumanMode).not.toHaveBeenCalled();
  });

  it('sends every other run to the human mode alone', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote });

    expect(mockRunHumanMode).toHaveBeenCalledTimes(1);
    expect(mockRunJsonMode).not.toHaveBeenCalled();
  });

  it('hands the mode the entries that it was given', async () => {
    const kitEntries = singleKitEntry(['deploy']);

    await runCommand({ kitEntries, json: false, remote });

    expect(mockRunHumanMode).toHaveBeenCalledWith(kitEntries, expect.anything(), false);
  });

  it('hands the remote fetch context to either mode', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote });
    await runCommand({ kitEntries: singleKitEntry(), json: true, remote });

    expect(mockRunHumanMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ remote }), false);
    expect(mockRunJsonMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ remote }), false);
  });

  it('resolves an unrequested detail to the full report', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true, remote });

    expect(mockRunJsonMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ detail: 'full' }), false);
  });

  it('passes through the detail that the invocation requested', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true, remote, detail: 'summary' });

    expect(mockRunJsonMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: 'summary' }),
      false,
    );
  });

  it('resolves an unrequested diagnose to an undiagnosed run', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote });

    expect(mockRunHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ diagnose: false }),
      false,
    );
  });

  it('passes the diagnose that the invocation requested through to either mode', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote, diagnose: true });
    await runCommand({ kitEntries: singleKitEntry(), json: true, remote, diagnose: true });

    expect(mockRunHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ diagnose: true }),
      false,
    );
    expect(mockRunJsonMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ diagnose: true }), false);
  });

  it('resolves an unrequested quiet to a loud run', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote });

    expect(mockRunHumanMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quiet: false }), false);
  });

  it('passes through the quiet that the invocation requested', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote, quiet: true });

    expect(mockRunHumanMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quiet: true }), false);
  });

  it('passes the thresholds that the invocation named through to the human mode', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote, failOn: 'warn', reportOn: 'error' });

    expect(mockRunHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failOn: 'warn', reportOn: 'error' }),
      false,
    );
  });

  it('passes the thresholds that the invocation named through to the JSON mode', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true, remote, failOn: 'warn', reportOn: 'error' });

    expect(mockRunJsonMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failOn: 'warn', reportOn: 'error' }),
      false,
    );
  });

  it('reports a run as not just-in-time unless told it is', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: false, remote });

    expect(mockRunHumanMode).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
  });

  it('passes a just-in-time run through to the mode', async () => {
    await runCommand({ kitEntries: singleKitEntry(), json: true, remote }, true);

    expect(mockRunJsonMode).toHaveBeenCalledWith(expect.anything(), expect.anything(), true);
  });

  it('returns the exit code resolved by the mode', async () => {
    mockRunHumanMode.mockResolvedValue(2);

    const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false, remote });

    expect(exitCode).toBe(2);
  });
});
