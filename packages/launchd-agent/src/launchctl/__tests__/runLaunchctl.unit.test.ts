import { describe, expect, it, vi } from 'vitest';

import { runProcess } from '../../process/runProcess.ts';
import { runLaunchctl } from '../runLaunchctl.ts';

vi.mock('../../process/runProcess.ts', () => ({ runProcess: vi.fn() }));

describe(runLaunchctl, () => {
  it('resolves with the exit code and merged output of a refused subcommand', async () => {
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 113, output: 'Could not find service\n', stdout: '' });

    await expect(runLaunchctl(['print', 'gui/501/dev.example'])).resolves.toStrictEqual({
      exitCode: 113,
      output: 'Could not find service\n',
    });
    expect(runProcess).toHaveBeenCalledWith('launchctl', ['print', 'gui/501/dev.example']);
  });

  it('rejects, naming launchctl, when launchctl cannot be run', async () => {
    vi.mocked(runProcess).mockRejectedValue(new Error('spawn launchctl ENOENT'));

    await expect(runLaunchctl(['print'])).rejects.toThrow('Could not run launchctl: spawn launchctl ENOENT.');
  });
});
