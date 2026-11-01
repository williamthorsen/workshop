import path from 'node:path';

import { type Command, createCli, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { buildAidemoEnv } from '../aidemo/build-aidemo-env.ts';
import { findEnvFileOverrides } from '../aidemo/find-env-file-overrides.ts';
import { MIN_REVOICE_AIDEMO_VERSION, resolveAidemo } from '../aidemo/resolve-aidemo.ts';
import { planTake, type TakeDisposition } from '../archive/plan-take.ts';
import { MACHINE_CONFIG_PATH } from '../config/read-machine-config.ts';
import { readRepoConfig } from '../config/read-repo-config.ts';
import { resolveArchiveRoot } from '../config/resolve-archive-root.ts';
import { isDemoRecorded } from '../demos/is-demo-recorded.ts';
import { resolveDemoDir } from '../demos/resolve-demo-dir.ts';
import { checkVoiceInstall } from '../voice/check-voice-install.ts';
import type { CommandContext } from './run.ts';
import { findMissingVoicePrerequisite, readRequiredVoice } from './voice-commands.ts';

/** The provider that provenance records for narration in the cloned voice. */
export const CLONED_VOICE_PROVIDER = 'mlx-audio';

/** The variables that, set by the demo repository's `.env`, would send the narration somewhere other than the proxy. */
export const REDIRECTING_VARIABLES: readonly string[] = [
  'AIDEMO_OPENAI_BASE_URL',
  'AIDEMO_TTS_MODEL',
  'AIDEMO_TTS_PROVIDER',
  'OPENAI_BASE_URL',
];

const EXIT_FAILURE = 1;

const PREFIX = 'thor-demo revoice';

const { defineCommand } = createCli<CommandContext>();

/** The `revoice` command, which narrates a recorded demo again in the cloned voice. */
export const REVOICE: Command<CommandContext> = defineCommand({
  summary: "Narrate a recorded demo again in the presenter's cloned voice",
  description: `Start the voice-clone server that voice setup installed, offline on 127.0.0.1, and run aidemo voice --force, captions --offline, and compose on one recorded demo, with aidemo's speech requests sent to a proxy on 127.0.0.1 that adds the voice profile. The narration and the recording stay on the machine. Then stop the server and archive the take as render does, with a provenance.json that records the mlx-audio provider, the model, and the reference recording's checksum. The footage is the demo's last recording; every scene is re-voiced.`,
  operands: [{ name: 'demo', description: "The demo's name, or its path under demosDir" }],
  epilog: `Requires:
  Apple Silicon, and a voice clone installed by thor-demo voice setup from the
  current voice section of ~/${MACHINE_CONFIG_PATH}
  A demo already recorded by thor-demo render
  @tandryukha/aidemo ${MIN_REVOICE_AIDEMO_VERSION} or later in the demo repository

The cloned voice ignores voice.speed and voice.instructions. A later render
re-voices the demo in its configured voice.

Example:
  thor-demo revoice quickstart`,
  run: ({ context, operands, stderr }) => runRevoice(context, operands.demo, stderr),
});

// region | Helpers

/** Replaces a take's voice with the cloned voice, and adds the reference recording's checksum. */
function describeClonedTake(take: TakeDisposition, model: string, referenceSha256: string): TakeDisposition {
  if (take.kind === 'notice') return take;

  return {
    kind: 'archive',
    plan: {
      ...take.plan,
      reference: { sha256: referenceSha256 },
      voice: { provider: CLONED_VOICE_PROVIDER, voiceId: model },
    },
  };
}

/** Reports a failed check to `stderr` and returns exit code 1. */
function fail(stderr: Writer, problem: string): number {
  stderr.write(`${PREFIX}: ${problem}\n`);
  return EXIT_FAILURE;
}

/**
 * Runs `revoice`: Checks everything that does not need a process, cheapest first and before the server could
 * start, then requests the revoice.
 */
function runRevoice(context: CommandContext, demoArgument: string, stderr: Writer): number | undefined {
  const { effects } = context;
  const missing = findMissingVoicePrerequisite(effects, true, []);
  if (missing !== undefined) return fail(stderr, missing);

  const repo = readRepoConfig(effects);
  if (!repo.ok) return fail(stderr, repo.message);
  const { aidemoEnv, archiveLabel, demosDir, root } = repo.config;

  const demo = resolveDemoDir(root, demosDir, demoArgument);
  if (!demo.found) {
    const names = demo.demoNames.length === 0 ? '(none)' : demo.demoNames.join(', ');
    throw new UsageError(`unknown demo "${demoArgument}"; the demos in ${demosDir} are: ${names}`);
  }

  const voice = readRequiredVoice(effects);
  if (!voice.ok) return fail(stderr, voice.problem);

  const install = checkVoiceInstall(voice.voice);
  if (!install.ok) return fail(stderr, install.problem);

  const aidemo = resolveAidemo(root, MIN_REVOICE_AIDEMO_VERSION);
  if (!aidemo.ok) return fail(stderr, aidemo.message);

  const redirects = findEnvFileOverrides(root, {}, REDIRECTING_VARIABLES);
  if (redirects !== undefined) {
    return fail(
      stderr,
      `${redirects.envFilePath} sets ${redirects.names.join(', ')}, which aidemo loads over the environment that thor-demo passes and which would send the narration elsewhere; remove them from the file`,
    );
  }

  if (!isDemoRecorded(demo.demoDir)) {
    return fail(stderr, `${demoArgument} has not been recorded; render it first with thor-demo render ${demoArgument}`);
  }

  const archiveRoot = resolveArchiveRoot(effects);
  if (!archiveRoot.ok) return fail(stderr, archiveRoot.message);

  const { model } = voice.voice;
  const env: NodeJS.ProcessEnv = {
    ...buildAidemoEnv(effects.env, aidemoEnv),
    AIDEMO_TTS_MODEL: model,
    AIDEMO_TTS_PROVIDER: 'openai',
  };
  // Leave the base URL to the performer, which sets AIDEMO_OPENAI_BASE_URL once the proxy listens.
  delete env['OPENAI_BASE_URL'];

  const take = planTake({
    aidemoEnv: env,
    aidemoVersion: aidemo.aidemo.version,
    archiveLabel,
    archiveRoot: archiveRoot.archiveRoot,
    demoDir: demo.demoDir,
    demosRoot: path.join(root, demosDir),
    params: [],
    readSourceState: effects.readSourceState,
    renderedAt: new Date(),
    root,
  });

  context.requestRevoice({
    bin: aidemo.aidemo.bin,
    cwd: root,
    env,
    stages: [
      ['voice', demo.demoDir, '--force'],
      ['captions', demo.demoDir, '--offline'],
      ['compose', demo.demoDir],
    ],
    take: describeClonedTake(take, model, install.referenceSha256),
    voice: voice.voice,
  });
  return;
}

// endregion | Helpers
