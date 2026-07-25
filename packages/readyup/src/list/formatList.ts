import { layout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';

/** Build the positional name hint, bracketed when a default kit exists. */
function buildKitHint(kits: string[]): string {
  return kits.includes('default') ? '[<name>]' : '<name>';
}

// -- Compiled-section style discriminants --

export interface LocalConventionStyle {
  kind: 'local-convention';
}

export interface CustomOutDirStyle {
  kind: 'custom-outDir';
  outDirRel: string;
}

export type CompiledStyle = LocalConventionStyle | CustomOutDirStyle;

// -- Owner view --

interface OwnerViewOptions {
  internalKits: string[];
  compiledKits: string[];
  compiledStyle: CompiledStyle;
  needsInternalFlag?: boolean;
}

/**
 * Format the owner-mode output showing internal and compiled kit sections.
 *
 * Empty sections are omitted. Returns the empty-owner message when both lists are empty.
 *
 * `needsInternalFlag` adds `--internal` to the internal-section hint. The flag is what makes a
 * configured internal directory or infix reachable, so the hint would name a failing command
 * without it; the default config needs neither, and omitting it keeps the shorter form.
 */
export function formatOwnerView({
  internalKits,
  compiledKits,
  compiledStyle,
  needsInternalFlag = false,
}: OwnerViewOptions): string {
  if (internalKits.length === 0 && compiledKits.length === 0) {
    return formatEmpty('owner');
  }

  const sections: string[] = [];

  if (internalKits.length > 0) {
    const internalFlag = needsInternalFlag ? ' --internal' : '';
    const hint = `rdy run --jit${internalFlag} ${buildKitHint(internalKits)}`;
    sections.push(formatSection('Internal', hint, internalKits, 'docInternal'));
  }

  if (compiledKits.length > 0) {
    if (compiledStyle.kind === 'local-convention') {
      const hint = `rdy run ${buildKitHint(compiledKits)}`;
      sections.push(formatSection('Compiled', hint, compiledKits, 'docCompiled'));
    } else {
      const hint = `rdy run --file <file path>`;
      const pathItems = compiledKits.map((name) => `${compiledStyle.outDirRel}/${name}.js`);
      sections.push(formatSection('Compiled', hint, pathItems, 'docCompiled'));
    }
  }

  return sections.join('\n\n');
}

// -- Consumer view --

interface ConsumerViewOptions {
  compiledKits: string[];
  fromArg: string;
  kitsDir: string;
}

/**
 * Format the consumer-mode output showing compiled kits at a local path.
 *
 * Returns the empty-consumer message when the kit list is empty.
 */
export function formatConsumerView({ compiledKits, fromArg, kitsDir }: ConsumerViewOptions): string {
  if (compiledKits.length === 0) {
    return formatEmpty('consumer', kitsDir);
  }

  const hint = `rdy run --from ${fromArg} ${buildKitHint(compiledKits)}`;
  return formatSection('Compiled', hint, compiledKits, 'docCompiled');
}

// -- Empty messages --

/** Format the "no kits found" message appropriate to the given mode. */
export function formatEmpty(mode: 'owner' | 'consumer', kitsDir?: string): string {
  if (mode === 'consumer') {
    return `No compiled kits found at ${kitsDir ?? '.readyup/kits'}.`;
  }
  return 'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.';
}

// -- Manifest view --

interface ManifestViewOptions {
  kits: Array<{ name: string; description?: string | undefined; readyupVersion?: string | undefined }>;
  manifestPath: string;
}

/**
 * Format a view of kits loaded from a manifest file.
 *
 * Kit names carry the compiled-output glyph. When a kit's `readyupVersion` is present, it appears as
 * a parenthetical between the name and the description, which follows the middle dot. The literal
 * `readyup` label is load-bearing: it disambiguates the version from a hypothetical kit-own version.
 * Descriptions appear inline when present; both fields are omitted independently.
 */
export function formatManifestView({ kits, manifestPath }: ManifestViewOptions): string {
  if (kits.length === 0) {
    return `No kits found in manifest: ${manifestPath}`;
  }

  const items = kits.map((kit) => {
    const versionSegment = kit.readyupVersion !== undefined ? ` (readyup v${kit.readyupVersion})` : '';
    return layout.formatCheckLine({
      token: 'docCompiled',
      name: `${kit.name}${versionSegment}`,
      ...(kit.description !== undefined && { detail: kit.description }),
    });
  });

  return [layout.formatHeadingLine(`Manifest: ${manifestPath}`, 'section'), ...items].join('\n');
}

// -- Helpers --

/**
 * Build a titled section: the title, the copy-pasteable command beneath it, then the kits.
 *
 * Splitting the command onto its own line is what makes it copy-pasteable. Fused to the title, it
 * could not be selected without also taking the label, and the title could not be scanned without
 * reading past the command.
 */
function formatSection(title: string, hint: string, kits: string[], token: TokenName): string {
  const items = kits.map((name) => layout.formatCheckLine({ token, name }));
  return [layout.formatHeadingLine(title, 'section'), ...layout.formatReasonBlock([hint]), '', ...items].join('\n');
}
