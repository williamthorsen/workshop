import { describe, expect, it, vi } from 'vitest';

import { runProcess } from '../../process/runProcess.ts';
import { runSystemctl } from '../runSystemctl.ts';

vi.mock('../../process/runProcess.ts', () => ({ runProcess: vi.fn() }));

describe(runSystemctl, () => {
  it('resolves with the exit code and merged output of a refused subcommand', async () => {
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 5, output: 'Unit example.service not found.\n', stdout: '' });

    await expect(runSystemctl(['restart', 'example.service'])).resolves.toStrictEqual({
      exitCode: 5,
      output: 'Unit example.service not found.\n',
    });
    expect(runProcess).toHaveBeenCalledWith('systemctl', ['restart', 'example.service']);
  });

  it('rejects, naming systemctl, when systemctl cannot be run', async () => {
    vi.mocked(runProcess).mockRejectedValue(new Error('spawn systemctl ENOENT'));

    await expect(runSystemctl(['daemon-reload'])).rejects.toThrow('Could not run systemctl: spawn systemctl ENOENT.');
  });
});
