/* eslint n/hashbang: off -- this is the CLI entrypoint; the build prepends the hashbang. */

import fs from 'node:fs';
import process from 'node:process';

import { createTokenTransport } from '@williamthorsen/toolbelt.atlassian/candidate';
import { ignoreBrokenPipes, installCrashHandler } from '@williamthorsen/toolbelt.cli/candidate';
import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';
import { createKeychainStore, promptSecret } from '@williamthorsen/toolbelt.secrets/candidate';

import { findSpecPath } from './findSpecPath.ts';
import { readStreamText } from './readStreamText.ts';
import { run } from './run.ts';

installCrashHandler('thor-jira');

ignoreBrokenPipes();

process.exitCode = await run(process.argv.slice(2), {
  createRequest: (options) => createTokenTransport(options),
  createStore: () => createKeychainStore(),
  cwd: () => process.cwd(),
  env: process.env,
  fetch,
  findSpecPath: (fromDir) => findSpecPath(fromDir),
  isStdinTty: () => process.stdin.isTTY,
  promptSecret: () => promptSecret(process.stdin, process.stderr),
  readStdin: () => readStreamText(process.stdin),
  readTextFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
  resolveVersion: () => resolveSelfVersion(import.meta.url),
  write: (text) => void process.stdout.write(text),
  writeError: (text) => void process.stderr.write(text),
});
