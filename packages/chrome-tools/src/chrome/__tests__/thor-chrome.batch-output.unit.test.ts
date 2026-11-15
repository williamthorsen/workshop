import { describe, expect, it } from 'vitest';

import { makeErrnoError } from '../../test-utils/errno-error.ts';
import { makeFakeThorChrome, makeRunningFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';
import { transcribe, transcribeBoth } from '../test-utils/transcribe.ts';

// Each case records the exit status, both streams, and the order of their writes, in prose and under --json
describe('thor-chrome output for verbs that act on several profiles', () => {
  describe('quit', () => {
    it('reports named profiles, interleaving a refusal with the rest', async () => {
      const make = () => {
        const fake = makeRunningFakeThorChrome(['atlas']);
        fake.makeProfile('thrive');
        return fake;
      };
      await expect(transcribe(make(), ['quit', 'atlas', 'scratch', 'thrive'])).resolves.toMatchInlineSnapshot(`
        "$ quit atlas scratch thrive
        exit 1
        --- stdout
        Quit profile 'atlas' (PID 4242).
        Profile 'thrive' is not running.

        --- stderr
        thor-chrome: profile 'scratch' does not exist at <home>/.local/share/thor-chrome/profiles/scratch
          List existing profiles: thor-chrome list

        --- combined
        Quit profile 'atlas' (PID 4242).
        thor-chrome: profile 'scratch' does not exist at <home>/.local/share/thor-chrome/profiles/scratch
          List existing profiles: thor-chrome list
        Profile 'thrive' is not running.
        "
      `);
      await expect(transcribe(make(), ['quit', 'atlas', 'scratch', 'thrive', '--json'])).resolves
        .toMatchInlineSnapshot(`
        "$ quit atlas scratch thrive --json
        exit 1
        --- stdout
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"stopped","headless":null,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"scratch","path":"<home>/.local/share/thor-chrome/profiles/scratch","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":null,"error":{"code":"profile-missing","message":"profile 'scratch' does not exist at <home>/.local/share/thor-chrome/profiles/scratch"}},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"stopped","headless":null,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"scratch","path":"<home>/.local/share/thor-chrome/profiles/scratch","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":null,"error":{"code":"profile-missing","message":"profile 'scratch' does not exist at <home>/.local/share/thor-chrome/profiles/scratch"}},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"}]}
        "
      `);
    });

    it('reports that --all found no running profile', async () => {
      await expect(transcribeBoth(makeFakeThorChrome(), ['quit', '--all'])).resolves.toMatchInlineSnapshot(`
        "$ quit --all
        exit 0
        --- stdout
        No running profiles.

        --- stderr

        --- combined
        No running profiles.

        $ quit --all --json
        exit 0
        --- stdout
        {"profiles":[]}

        --- stderr

        --- combined
        {"profiles":[]}
        "
      `);
    });

    it('reports a browser that could not be signalled', async () => {
      const make = () => makeRunningFakeThorChrome(['thrive'], { killError: makeErrnoError('EPERM') });
      await expect(transcribe(make(), ['quit', 'thrive'])).resolves.toMatchInlineSnapshot(`
        "$ quit thrive
        exit 1
        --- stdout

        --- stderr
        thor-chrome: not permitted to signal PID 4242 for profile 'thrive'; end it from a terminal outside the sandbox, or as the user who owns it

        --- combined
        thor-chrome: not permitted to signal PID 4242 for profile 'thrive'; end it from a terminal outside the sandbox, or as the user who owns it
        "
      `);
      await expect(transcribe(make(), ['quit', 'thrive', '--json'])).resolves.toMatchInlineSnapshot(`
        "$ quit thrive --json
        exit 1
        --- stdout
        {"profiles":[{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"running-without-port","headless":false,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z","error":{"code":"quit-failed","message":"not permitted to signal PID 4242 for profile 'thrive'; end it from a terminal outside the sandbox, or as the user who owns it"}}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"running-without-port","headless":false,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z","error":{"code":"quit-failed","message":"not permitted to signal PID 4242 for profile 'thrive'; end it from a terminal outside the sandbox, or as the user who owns it"}}]}
        "
      `);
    });
  });

  describe('quit --idle', () => {
    it('reports that no profile is idle', async () => {
      await expect(transcribeBoth(makeFakeThorChrome(), ['quit', '--idle', '1s'])).resolves.toMatchInlineSnapshot(`
        "$ quit --idle 1s
        exit 0
        --- stdout
        No idle profiles.

        --- stderr

        --- combined
        No idle profiles.

        $ quit --idle 1s --json
        exit 0
        --- stdout
        {"profiles":[]}

        --- stderr

        --- combined
        {"profiles":[]}
        "
      `);
    });

    it('reports a profile that it quit once idle long enough', async () => {
      const transcripts = [];
      for (const format of [[], ['--json']]) {
        const fake = makeRunningFakeThorChrome(['thrive'], { hasPorts: true });
        await transcribe(fake, ['quit', '--idle', '1s']);
        fake.advance(2000);
        transcripts.push(await transcribe(fake, ['quit', '--idle', '1s', ...format]));
      }
      expect(transcripts.join('\n')).toMatchInlineSnapshot(`
        "$ quit --idle 1s
        exit 0
        --- stdout
        Quit idle profile 'thrive' (PID 4242).

        --- stderr

        --- combined
        Quit idle profile 'thrive' (PID 4242).

        $ quit --idle 1s --json
        exit 0
        --- stdout
        {"profiles":[{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"stopped","headless":null,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"stopped","headless":null,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"}]}
        "
      `);
    });
  });

  describe('delete', () => {
    it('reports named profiles, interleaving a refusal with the rest', async () => {
      const make = () => {
        const fake = makeRunningFakeThorChrome(['atlas']);
        fake.makeProfile('thrive', { origin: 'named' });
        return fake;
      };
      await expect(transcribe(make(), ['delete', 'atlas', 'thrive'])).resolves.toMatchInlineSnapshot(`
        "$ delete atlas thrive
        exit 1
        --- stdout
        Deleted profile 'thrive' (<home>/.local/share/thor-chrome/profiles/thrive).

        --- stderr
        thor-chrome: profile 'atlas' is running (PID 4242)
          Quit it first: thor-chrome quit atlas
          Or quit it and delete it in one step: thor-chrome delete atlas --force

        --- combined
        thor-chrome: profile 'atlas' is running (PID 4242)
          Quit it first: thor-chrome quit atlas
          Or quit it and delete it in one step: thor-chrome delete atlas --force
        Deleted profile 'thrive' (<home>/.local/share/thor-chrome/profiles/thrive).
        "
      `);
      await expect(transcribe(make(), ['delete', 'atlas', 'thrive', '--json'])).resolves.toMatchInlineSnapshot(`
        "$ delete atlas thrive --json
        exit 1
        --- stdout
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"running-without-port","headless":false,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z","error":{"code":"profile-running","message":"profile 'atlas' is running (PID 4242)"}},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"deleted","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"running-without-port","headless":false,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z","error":{"code":"profile-running","message":"profile 'atlas' is running (PID 4242)"}},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"deleted","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}]}
        "
      `);
    });

    it('reports what a dry run would remove', async () => {
      const make = () => {
        const fake = makeRunningFakeThorChrome(['atlas']);
        fake.makeProfile('thrive', { origin: 'named' });
        return fake;
      };
      await expect(transcribe(make(), ['delete', 'atlas', 'thrive', '--force', '--dry-run'])).resolves
        .toMatchInlineSnapshot(`
        "$ delete atlas thrive --force --dry-run
        exit 0
        --- stdout
        Would quit and delete profile 'atlas' (PID 4242, <home>/.local/share/thor-chrome/profiles/atlas).
        Would delete profile 'thrive' (<home>/.local/share/thor-chrome/profiles/thrive).

        --- stderr

        --- combined
        Would quit and delete profile 'atlas' (PID 4242, <home>/.local/share/thor-chrome/profiles/atlas).
        Would delete profile 'thrive' (<home>/.local/share/thor-chrome/profiles/thrive).
        "
      `);
      await expect(transcribe(make(), ['delete', 'atlas', 'thrive', '--force', '--dry-run', '--json'])).resolves
        .toMatchInlineSnapshot(`
        "$ delete atlas thrive --force --dry-run --json
        exit 0
        --- stdout
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"deleted","headless":null,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"deleted","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}],"dryRun":true}

        --- stderr

        --- combined
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"deleted","headless":null,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z"},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"deleted","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}],"dryRun":true}
        "
      `);
    });

    it('reports a --derived profile that is absent, and one that is not recorded as derived', async () => {
      await expect(transcribeBoth(makeFakeThorChrome(), ['delete', '--derived'])).resolves.toMatchInlineSnapshot(`
        "$ delete --derived
        exit 0
        --- stdout
        No profile derived from this worktree (<home>/.local/share/thor-chrome/profiles/widget-321).

        --- stderr

        --- combined
        No profile derived from this worktree (<home>/.local/share/thor-chrome/profiles/widget-321).

        $ delete --derived --json
        exit 0
        --- stdout
        {"profiles":[]}

        --- stderr

        --- combined
        {"profiles":[]}
        "
      `);
      const make = () => {
        const fake = makeFakeThorChrome();
        fake.makeProfile('widget-321', { origin: 'named' });
        return fake;
      };
      await expect(transcribe(make(), ['delete', '--derived'])).resolves.toMatchInlineSnapshot(`
        "$ delete --derived
        exit 1
        --- stdout

        --- stderr
        thor-chrome: profile 'widget-321' is not recorded as derived from <home>/work/widget on branch '321', so --derived keeps it
          Delete it by name instead: thor-chrome delete widget-321

        --- combined
        thor-chrome: profile 'widget-321' is not recorded as derived from <home>/work/widget on branch '321', so --derived keeps it
          Delete it by name instead: thor-chrome delete widget-321
        "
      `);
      await expect(transcribe(make(), ['delete', '--derived', '--json'])).resolves.toMatchInlineSnapshot(`
        "$ delete --derived --json
        exit 1
        --- stdout
        {"profiles":[{"name":"widget-321","path":"<home>/.local/share/thor-chrome/profiles/widget-321","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z","error":{"code":"profile-not-derived","message":"profile 'widget-321' is not recorded as derived from <home>/work/widget on branch '321', so --derived keeps it"}}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"widget-321","path":"<home>/.local/share/thor-chrome/profiles/widget-321","state":"stopped","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z","error":{"code":"profile-not-derived","message":"profile 'widget-321' is not recorded as derived from <home>/work/widget on branch '321', so --derived keeps it"}}]}
        "
      `);
    });

    it('sweeps every profile, retaining a running one, and summarizes', async () => {
      const make = () => {
        const fake = makeRunningFakeThorChrome(['atlas']);
        fake.makeProfile('thrive', { origin: 'named' });
        return fake;
      };
      await expect(transcribe(make(), ['delete', '--all'])).resolves.toMatchInlineSnapshot(`
        "$ delete --all
        exit 0
        --- stdout
        Retained profile 'atlas': running (PID 4242).
        Deleted profile 'thrive' (<home>/.local/share/thor-chrome/profiles/thrive).
        Deleted 1 profile, retaining 1 profile.

        --- stderr

        --- combined
        Retained profile 'atlas': running (PID 4242).
        Deleted profile 'thrive' (<home>/.local/share/thor-chrome/profiles/thrive).
        Deleted 1 profile, retaining 1 profile.
        "
      `);
      await expect(transcribe(make(), ['delete', '--all', '--json'])).resolves.toMatchInlineSnapshot(`
        "$ delete --all --json
        exit 0
        --- stdout
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"running-without-port","headless":false,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z","retained":"running"},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"deleted","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}]}

        --- stderr

        --- combined
        {"profiles":[{"name":"atlas","path":"<home>/.local/share/thor-chrome/profiles/atlas","state":"running-without-port","headless":false,"pid":4242,"port":null,"derivedPort":null,"devtools":null,"origin":null,"repo":null,"branch":null,"stale":null,"lastUsedAt":"2026-01-02T12:00:00Z","retained":"running"},{"name":"thrive","path":"<home>/.local/share/thor-chrome/profiles/thrive","state":"deleted","headless":null,"pid":null,"port":null,"derivedPort":null,"devtools":null,"origin":"named","repo":null,"branch":null,"stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}]}
        "
      `);
      await expect(transcribeBoth(makeFakeThorChrome(), ['delete', '--stale'])).resolves.toMatchInlineSnapshot(`
        "$ delete --stale
        exit 0
        --- stdout
        No stale profiles.

        --- stderr

        --- combined
        No stale profiles.

        $ delete --stale --json
        exit 0
        --- stdout
        {"profiles":[]}

        --- stderr

        --- combined
        {"profiles":[]}
        "
      `);
    });
  });
});
