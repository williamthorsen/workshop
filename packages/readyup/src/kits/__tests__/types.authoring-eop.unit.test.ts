import { describe, expectTypeOf, it } from 'vitest';

import type {
  CheckOutcome,
  FindingOutcome,
  FixLocation,
  OutcomeFinding,
  Progress,
  RdyCheck,
  RdyChecklist,
  RdyConfig,
  RdyKit,
  RdyStagedChecklist,
  Severity,
  SkipResult,
} from '../types.ts';

// Regression guards for the public authoring surface under
// `exactOptionalPropertyTypes: true`. Consumer kits use idiomatic factory
// patterns such as `return { ..., fix: opts.fix }` where `opts.fix?: string`;
// that pattern only compiles when `RdyCheck.fix` is declared as
// `string | undefined` rather than bare `string`. If any of the optional
// fields below is re-tightened, this file will fail to compile. See #67.

describe('public authoring types under exactOptionalPropertyTypes', () => {
  it('CheckOutcome allows explicit undefined on optional fields', () => {
    const detail: string | undefined = undefined;
    const progress: Progress | undefined = undefined;
    const outcome: CheckOutcome = { ok: true, detail, progress };

    expectTypeOf(outcome).toEqualTypeOf<CheckOutcome>();
    expectTypeOf<CheckOutcome['detail']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CheckOutcome['progress']>().toEqualTypeOf<Progress | undefined>();
  });

  it('FindingOutcome allows explicit undefined on optional fields', () => {
    function makeOutcome(opts: { adoptedCount?: number; symbol?: string }): FindingOutcome {
      return {
        adoptedCount: opts.adoptedCount,
        findings: [{ line: 1, path: 'src/a.ts', reported: true, symbol: opts.symbol }],
      };
    }

    expectTypeOf(makeOutcome).returns.toEqualTypeOf<FindingOutcome>();
    expectTypeOf<FindingOutcome['adoptedCount']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<OutcomeFinding['symbol']>().toEqualTypeOf<string | undefined>();
  });

  it('RdyCheck allows explicit undefined on optional fields', () => {
    function makeCheck(opts: { name: string; fix?: string; id?: string; severity?: Severity }): RdyCheck {
      return {
        name: opts.name,
        id: opts.id,
        check: () => true,
        fix: opts.fix,
        severity: opts.severity,
      };
    }

    expectTypeOf(makeCheck).returns.toEqualTypeOf<RdyCheck>();
    expectTypeOf<RdyCheck['id']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<RdyCheck['severity']>().toEqualTypeOf<Severity | undefined>();
    expectTypeOf<RdyCheck['skip']>().toEqualTypeOf<(() => SkipResult | Promise<SkipResult>) | undefined>();
    expectTypeOf<RdyCheck['fix']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<RdyCheck['checks']>().toEqualTypeOf<RdyCheck[] | undefined>();
  });

  it('RdyChecklist allows explicit undefined on optional fields', () => {
    const preconditions: RdyCheck[] | undefined = undefined;
    const fixLocation: FixLocation | undefined = undefined;
    const checklist: RdyChecklist = {
      name: 'x',
      preconditions,
      checks: [{ name: 'c', check: () => true }],
      fixLocation,
    };

    expectTypeOf(checklist).toEqualTypeOf<RdyChecklist>();
    expectTypeOf<RdyChecklist['preconditions']>().toEqualTypeOf<RdyCheck[] | undefined>();
    expectTypeOf<RdyChecklist['fixLocation']>().toEqualTypeOf<FixLocation | undefined>();
  });

  it('RdyStagedChecklist allows explicit undefined on optional fields', () => {
    const preconditions: RdyCheck[] | undefined = undefined;
    const fixLocation: FixLocation | undefined = undefined;
    const staged: RdyStagedChecklist = {
      name: 'x',
      preconditions,
      groups: [[{ name: 'c', check: () => true }]],
      fixLocation,
    };

    expectTypeOf(staged).toEqualTypeOf<RdyStagedChecklist>();
    expectTypeOf<RdyStagedChecklist['preconditions']>().toEqualTypeOf<RdyCheck[] | undefined>();
    expectTypeOf<RdyStagedChecklist['fixLocation']>().toEqualTypeOf<FixLocation | undefined>();
  });

  it('RdyKit allows explicit undefined on optional fields', () => {
    function makeKit(opts: {
      description?: string;
      defaultSeverity?: Severity;
      failOn?: Severity;
      reportOn?: Severity;
      fixLocation?: FixLocation;
      suites?: Record<string, string[]>;
    }): RdyKit {
      return {
        checklists: [],
        description: opts.description,
        defaultSeverity: opts.defaultSeverity,
        failOn: opts.failOn,
        reportOn: opts.reportOn,
        fixLocation: opts.fixLocation,
        suites: opts.suites,
      };
    }

    expectTypeOf(makeKit).returns.toEqualTypeOf<RdyKit>();
    expectTypeOf<RdyKit['description']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<RdyKit['suites']>().toEqualTypeOf<Record<string, string[]> | undefined>();
    expectTypeOf<RdyKit['defaultSeverity']>().toEqualTypeOf<Severity | undefined>();
    expectTypeOf<RdyKit['failOn']>().toEqualTypeOf<Severity | undefined>();
    expectTypeOf<RdyKit['reportOn']>().toEqualTypeOf<Severity | undefined>();
    expectTypeOf<RdyKit['fixLocation']>().toEqualTypeOf<FixLocation | undefined>();
  });

  it('RdyConfig allows explicit undefined on optional fields', () => {
    function makeConfig(opts: {
      srcDir?: string;
      outDir?: string;
      include?: string;
      dir?: string;
      infix?: string;
    }): RdyConfig {
      return {
        compile: {
          srcDir: opts.srcDir,
          outDir: opts.outDir,
          include: opts.include,
        },
        internal: {
          dir: opts.dir,
          infix: opts.infix,
        },
      };
    }

    expectTypeOf(makeConfig).returns.toEqualTypeOf<RdyConfig>();

    const topLevelUndefined: RdyConfig = { compile: undefined, internal: undefined };
    expectTypeOf(topLevelUndefined).toEqualTypeOf<RdyConfig>();
  });
});
