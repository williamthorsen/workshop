/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */
import process from 'node:process';

import { defineCommand, runCli } from '@williamthorsen/toolbelt.cli/candidate';

import { runThorChrome } from '../chrome/thor-chrome.ts';
import { reportCommandErrorsAsync } from '../shared/errors.ts';

const name = 'thor-chrome';

const command = defineCommand({
  passthrough: true,
  summary: 'Launch a Chrome-family browser with remote debugging against a named profile',
  run: ({ args, stderr, stdout }) => {
    const output = { name, stderr, stdout };
    return reportCommandErrorsAsync(output, () => runThorChrome(args, output));
  },
});

process.exitCode = await runCli(process.argv.slice(2), command, {
  name,
  stderr: process.stderr,
  stdout: process.stdout,
});
