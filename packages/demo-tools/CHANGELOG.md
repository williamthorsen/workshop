# Changelog

All notable changes to this project will be documented in this file.

## 0.4.2 — 2026-11-22

### 📦 Dependencies

- Upgrade toolbelt packages (#996)

  Upgrades the `@williamthorsen/toolbelt.*` entries in the `pnpm-workspace.yaml` catalog to their latest versions and imports each symbol that the new releases promoted out of the `/candidate` subpath from its package root. It also corrects the toolbelt imports in the kit-testing example of ReadyUp's `authoring-kits.md` guide.

## 0.4.1 — 2026-11-17

### ♻️ Refactoring

- Replaces the `EPIPE` handler copied into each `thor-*` entry point, and the prompt helpers copied into `thor-node` and `thor-npm`, with `ignoreBrokenPipes`, `readAnswer`, and `isAffirmative` from `@williamthorsen/toolbelt.cli`. (#949)

## 0.4.0 — 2026-11-16

### 🎉 Features

- Adds an optional `voice.sampling` section to the machine config, whose `repetition_penalty`, `temperature`, `top_k`, and `top_p` values `thor-demo voice setup` and `thor-demo revoice` send with each speech request to mlx-audio, which takes any key left unset from the model's configuration and then from its own default. (#926)
- Adds the configured sampling to the `provenance.json` of a `revoice` take as `voice.sampling`, a field that `thor-demo` omits when the section does not set any key. (#926)
- Adds the `revoice.extraGapMs` key to `.config/thor-demo.yaml`, which sets the milliseconds of silence that `thor-demo revoice` appends after each scene's narration, defaults to 700, and is kept out of the caption timing. (#932)
- Records the added silence as `voice.extraGapMs` in the `provenance.json` of a revoiced take. (#932)
- Makes `thor-demo voice setup` stop a model or companion-repository download whose files on disk have not changed for 5 minutes, and run a stalled or failed download up to 3 times before it reports that rerunning setup resumes the download. (#933)
- Makes `thor-demo revoice` synthesize a refused clip again and report each retake, up to 3 takes that share the 9-minute limit of one request, rather than stop the run at the first refused take. (#934)

### 🐛 Bug fixes

- Fixes the issue that `thor-demo voice setup` did not download `OpenMOSS-Team/MOSS-Audio-Tokenizer`, the audio tokenizer that `OpenMOSS-Team/MOSS-TTS` and `OpenMOSS-Team/MOSS-TTS-v1.5` need in order to load offline. (#920)
- Fixes the issue that `thor-demo voice setup` and `thor-demo revoice` failed when a large voice model's first load ran past the fixed limit on the speech request, by limiting the load to 10 minutes plus the time to read the model at 200 MB/s and limiting the synthesis separately. (#930)
- Fixes the issue that `thor-demo revoice` accepted a cloned clip that opened with, or paused for, more than 3 s of silence, and makes the refusal name the longest silence, its length, and where it falls in the clip. (#934)
- Fixes the issue that `--version` reported a failure to resolve the CLI's own version as a usage error and exited 2, rather than exiting 1, the exit code that the help gives for an internal error. (#943)

### ⚙️ Tooling

- Adds `scripts/measure-first-load.ts`, which times a voice model's first load with the file cache cleared or right after a large write, or checks that `voice setup` and `revoice` succeed after a first load with the cache cleared. (#930)

## 0.3.0 — 2026-11-15

### 🎉 Features

- Installs a crash handler in `thor-demo` so that an error that the CLI does not handle prints `thor-demo: internal error: <message>` with its stack frames and exits 1, and adds that case to exit code 1 in the help text. (#852)

### 🐛 Bug fixes

- Fixes the issue that `thor-demo revoice` could exit before stopping the voice-clone server when aidemo disconnected in the middle of a speech request, and reports any other speech-proxy fault as the reason that the aidemo stage failed. (#856)
- Fixes the issue that an installed `thor-chrome`, `thor-demo`, `thor-git`, `thor-jira`, `thor-node`, `thor-npm`, `thor-repo`, `thor-secret`, or `overlay` reported an unanticipated error as `<bin>: failed to load: <message>` without stack frames, and now prints `<bin>: internal error: <message>` with the stack frames. (#876)

### ♻️ Refactoring

- Replaces the local `isRecord` module in `demo-tools` with the identical `isRecord` exported by `@williamthorsen/toolbelt.objects`, which is added to the workspace catalog and to the package's dependencies. (#847)
- Replaces the `launch`, `revoice`, and `voice` fields of `run`'s result and the three `CommandContext` callbacks with one `RunRequest` union discriminated by `kind`, which makes the type enforce that a command requests at most one action. (#848)
- Orders the helpers and peer exports in `demo-tools` source and test utilities alphabetically, as the declaration-order rule of the layout conventions requires. (#853)
- Injects the voice-clone server start into `performRevoice` as a `startServer` effect, which `thor-demo` supplies as `startVoiceServer`, so that unit tests can replace the start. (#854)
- Renames `nonEmpty` in `build-aidemo-env.ts` to `omitEmpty`, and the test helpers `fakeFfmpeg` and `refusal` to `createFakeFfmpeg` and `buildRefusalSummary`, following the convention that a function name starts with a verb. (#857)
- Makes eight `demo-tools` constants and functions module-private, among them `REQUEST_BUDGET_MS` and `planReferenceConversion`, because other modules don't import any of them, and moves `planReferenceConversion` below its caller in `build-voice-profile.ts`. (#858)
- Deletes the five identical copies of `createTextBuffer` and imports the one exported by `@williamthorsen/toolbelt.cli/candidate` in their place. (#861)

### 🧪 Tests

- Adds unit tests for `performRevoice` that cover its stage order, a server that does not start, a stage that exits non-zero or throws, and a stage that fails after the proxy refused a text, and removes the silent-clip example from the revoice tool test along with the `FAKE_CLIP_SILENT` switch of the fake ffmpeg. (#854)
- Moves the `sha256` helper, which four test files each defined separately, into one shared `hashContent` helper in `src/test-utils/hash-content.ts`, which the plan-take test also uses in place of its inline hash. (#857)
- Adds the `buildRunEffects` test helper, which returns inert `RunEffects` for a run at `/` on Apple Silicon macOS with the caller's overrides applied, and uses it in place of the stubs that `run.unit.test.ts`, `run.profile.unit.test.ts`, and `run.revoice.unit.test.ts` each defined, which moves `run.unit.test.ts` back from its `max-lines` limit. (#860)

## 0.2.1 — 2026-11-12

### Notes

- Forced version bump.

## 0.2.0 — 2026-11-09

### 🎉 Features

- Upgrade toolbelt.cli to 0.8.0 (#744)

  Changes every `thor-*` binary to start a usage error with its own name, as `thor-npm: <message>`, in place of `Error: <message>`, and keeps the `Try '… --help'.` line that follows it. The change upgrades `@williamthorsen/toolbelt.cli` to 0.8.0, whose `runCli` prints the new prefix, and changes `thor-chrome`, which reports usage errors through its own renderer, to print the same prefix.

### 🧪 Tests

- Replaces the real-time sleeps in tests with waits that do not depend on wall time, a `setImmediate` yield in the `runRdy` and `readStreamText` tests and a wait for the stub upstream's close in the `speech-proxy` disconnect test, and disables `sky-pilot/no-real-time-sleep` at the two `chrome-tools` polling loops that wait on a real external process. (#742)

## 0.1.0 — 2026-11-05

### 🎉 Features

- Adds the `@williamthorsen/demo-tools` package, whose initial `thor-demo` binary prints its help and version and rejects every other argument with exit code 2, until later releases add its commands. (#657)
- Adds the `thor-demo render`, `probe`, and `mcp` commands, which run aidemo from the root of the demo repository with the variables that `aidemo.env` in `.config/thor-demo.yaml` declares, and pass the options after the demo name to aidemo unchanged. (#658)
- Makes `thor-demo` remove `AIDEMO_OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL` from aidemo's environment unless `aidemo.env` declares them, which keeps captions offline with a local voice, and warn when the demo repository's `.env` sets one that is not declared. (#658)
- Declares `@tandryukha/aidemo` `>=0.17.0` as an optional peer dependency, which `thor-demo` resolves from the demo repository rather than from its own install location, so that a global `thor-demo` runs each repository's pinned aidemo. (#658)
- Adds archiving to `thor-demo render`, which copies each take that aidemo renders successfully into `<archive root>/<archive.label>/<demo>/<timestamp>_<commit>/` together with its caption files, `report.json`, and a `provenance.json` that records the source commit, the aidemo version, the resolved voice, the options, and a checksum of each file, and which exits 1 when archiving fails. (#659)
- Adds the archive settings: `archive.root` in `~/.config/thor-demo/config.yaml` or the `THOR_DEMO_ARCHIVE_ROOT` variable, which overrides it, sets an absolute archive root per machine, and `archive.label` in `.config/thor-demo.yaml` names the repository's directory under that root, defaulting to the name of the repository's root directory. (#659)
- Adds `thor-demo voice setup`, which installs a pinned mlx-audio and the model named by `voice.model` (default `mlx-community/higgs-audio-v2-3B-mlx-q8`) under `voice.home`, builds a voice profile from the reference recording and transcript named by `voice.reference`, and checks the clone by synthesizing a phrase offline on 127.0.0.1 to `verify.mp3`. (#664)
- Adds `thor-demo voice record`, which records the reference from the microphone named by `--microphone`, saves it to `voice.reference.audio`, reports its loudness, and plays it back, and `thor-demo voice microphones`, which lists the microphones that `voice record` can use. (#664)
- Adds the `thor-demo revoice` command, which keeps a demo's last recording and replaces its narration with speech generated on the machine by the voice clone that `thor-demo voice setup` installs, and which requires Apple Silicon and aidemo 0.20.2 or later in the demo repository. (#667)
- Adds a `reference` field to the `provenance.json` of a take narrated in the cloned voice, which records the `sha256` of the reference recording from which the voice was cloned. (#667)
- Adds the scene's text and the reason for the refusal to the message that `thor-demo revoice` prints when it stops on a refused clip. (#684)
- Records each scene's `id`, TTS `provider`, and `voiceId` under `voice.scenes` in an archived take's `provenance.json`, as read from the `audio/voice.json` that aidemo writes, and raises the record's `schemaVersion` to `2`; `render` and `revoice` now exit 1 without archiving the take when aidemo did not write `audio/voice.json`. (#699)
- Raises the minimum aidemo version for every `thor-demo` command from 0.17.0, and for `revoice` from 0.20.2, to 0.20.3, in both the peer dependency range and the check that `thor-demo` runs before starting aidemo. (#699)
- Makes `thor-demo` run every aidemo process on the Chrome profile `~/.local/share/thor-demo/chrome-profiles/<archive.label>`, which an aidemo upgrade or reinstall leaves in place, unless a non-empty `AIDEMO_CHROME_PROFILE` in `aidemo.env` or, after it, in the environment names another profile. (#700)
- Adds `thor-demo login` and `thor-demo profile`, which run aidemo's `login` and `profile` commands on the recording profile that `thor-demo render` and `thor-demo probe` use. (#700)
- Adds a warning, printed by `thor-demo render` and `thor-demo probe` before they start aidemo, about each of aidemo's working paths in the demo directory that git tracks or that the repository's ignore rules do not cover. (#700)

### 🐛 Bug fixes

- Fixes the issue that `thor-demo` could run an aidemo found through `NODE_PATH`, which a pnpm bin shim sets to the store of the package that it launches, instead of the aidemo installed in the demo repository. (#674)
- Fixes the issue that `thor-demo revoice` accepted a silent, truncated, or trailing-silence clip from the voice clone into the take, and waited on a hung request until aidemo retried it, by having the speech proxy refuse such a clip, and any request that is still unanswered after 9 minutes, without a retry. (#684)

### ⚙️ Tooling

- Adds a `demos/` directory to `demo-tools` with the storyboards, golden probes, deck, fixture, and `demo:serve` static server that render the agent-records video, and installs aidemo 0.20.2 and `kokoro-js` 1.2.1 as dev dependencies to render it. (#674)

### 📦 Dependencies

- Upgrade eslint-config-typescript to 20.2.0 (#692)

  Upgrades `@williamthorsen/eslint-config-typescript` from 20.1.3 to 20.2.0, which brings `eslint-plugin-unicorn` 79 and `typescript-eslint` 8.72.1, and edits the code across the packages to satisfy the rules that the new versions add. The most widespread of those rules is `unicorn/numeric-separators-style`, which now rejects a separator in a number of fewer than 5 digits, such as `1_000`.

### 📚 Documentation

- Adds a "Demo video" section to the `demo-tools` README, which links the agent-records video and lists the commands that render it again from a clone. (#674)
- Rewrites the `agent-records-demo` storyboard so that each scene after the title marks the narrated line with a highlight, spotlight, or callout beat timed to the word that names it, and replaces the drifting hold with a frozen frame. (#675)
- Fixes the issue that the title scene's narrator read "records" as a noun, by giving the voice a verb-stress respelling while the captions keep "records". (#675)
- Removes the `demo-tools` README link to the demo video, which pointed at a release asset that was never uploaded, and names `demos/agent-records-demo` as the demo that renders the video. (#675)
- Rebuilds the `agent-records-demo` deck and storyboard as nine scenes, about three minutes long, that open on the finished output, show the agent's aidemo MCP calls and the probe, render, and re-voice stages, and close with the install lines for Claude Code, Codex, Gemini, and Rovo Dev. (#679)
- Gives the `sample-tour` demo aidemo's browser frame, a 1280×720 output size, and a named still in each of its three scenes, which the `agent-records-demo` video shows. (#679)
- Adds the `what-thor-demo-adds` demo under `packages/demo-tools/demos/`, whose five deck pages, storyboard, and golden probe show each `thor-demo` addition first without `thor-demo` and then with it, and whose deck `demos/serve.mjs` now serves at `/adds/`. (#682)
- Renames the `demo-tools` README section "Demo video" to "Demo videos", links it to the demo-tools releases that host the published videos, and documents how to render `what-thor-demo-adds` and how to compose it again with `leadInMs` set to `0`, which corrects the three-second lead-in that aidemo 0.20.2 adds. (#682)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
