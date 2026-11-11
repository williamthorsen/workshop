import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import { runCommand } from '../runCommand.ts';
import type { runHumanMode } from '../runHumanMode.ts';
import type { runJsonMode } from '../runJsonMode.ts';
import { buildSingleKitEntry } from '../test-utils/kit-fixtures.ts';

const remote = createUncachedRemoteContext();

describe(runCommand, () => {
  // Both modes are faked: The dispatch owns the choice between them and the settings that it hands over.
  let modes: { runHumanMode: Mock<typeof runHumanMode>; runJsonMode: Mock<typeof runJsonMode> };

  beforeEach(() => {
    modes = {
      runHumanMode: vi.fn<typeof runHumanMode>().mockResolvedValue(0),
      runJsonMode: vi.fn<typeof runJsonMode>().mockResolvedValue(0),
    };
  });

  it('sends a JSON run to the JSON mode alone', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: true, remote }, false, modes);

    expect(modes.runJsonMode).toHaveBeenCalledTimes(1);
    expect(modes.runHumanMode).not.toHaveBeenCalled();
  });

  it('sends every other run to the human mode alone', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledTimes(1);
    expect(modes.runJsonMode).not.toHaveBeenCalled();
  });

  it('hands the mode the entries that it was given', async () => {
    const kitEntries = buildSingleKitEntry(['deploy']);

    await runCommand({ kitEntries, isJson: false, remote }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledWith(kitEntries, expect.anything(), false);
  });

  it('hands the remote fetch context to either mode', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote }, false, modes);
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: true, remote }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ remote }), false);
    expect(modes.runJsonMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ remote }), false);
  });

  it('resolves an unrequested detail to the full report', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: true, remote }, false, modes);

    expect(modes.runJsonMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: 'full' }),
      false,
    );
  });

  it('passes through the detail that the invocation requested', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: true, remote, detail: 'summary' }, false, modes);

    expect(modes.runJsonMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: 'summary' }),
      false,
    );
  });

  it('resolves an unrequested diagnose to an undiagnosed run', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shouldDiagnose: false }),
      false,
    );
  });

  it('passes the diagnose that the invocation requested through to either mode', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote, shouldDiagnose: true }, false, modes);
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: true, remote, shouldDiagnose: true }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shouldDiagnose: true }),
      false,
    );
    expect(modes.runJsonMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shouldDiagnose: true }),
      false,
    );
  });

  it('resolves an unrequested quiet to a loud run', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quiet: false }),
      false,
    );
  });

  it('passes through the quiet that the invocation requested', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote, quiet: true }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quiet: true }), false);
  });

  it('passes the thresholds that the invocation named through to the human mode', async () => {
    await runCommand(
      { kitEntries: buildSingleKitEntry(), isJson: false, remote, failOn: 'warn', reportOn: 'error' },
      false,
      modes,
    );

    expect(modes.runHumanMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failOn: 'warn', reportOn: 'error' }),
      false,
    );
  });

  it('passes the thresholds that the invocation named through to the JSON mode', async () => {
    await runCommand(
      { kitEntries: buildSingleKitEntry(), isJson: true, remote, failOn: 'warn', reportOn: 'error' },
      false,
      modes,
    );

    expect(modes.runJsonMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failOn: 'warn', reportOn: 'error' }),
      false,
    );
  });

  it('reports a run as not just-in-time unless told it is', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote }, false, modes);

    expect(modes.runHumanMode).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
  });

  it('passes a just-in-time run through to the mode', async () => {
    await runCommand({ kitEntries: buildSingleKitEntry(), isJson: true, remote }, true, modes);

    expect(modes.runJsonMode).toHaveBeenCalledWith(expect.anything(), expect.anything(), true);
  });

  it('returns the exit code resolved by the mode', async () => {
    modes.runHumanMode.mockResolvedValue(2);

    const exitCode = await runCommand({ kitEntries: buildSingleKitEntry(), isJson: false, remote }, false, modes);

    expect(exitCode).toBe(2);
  });
});
