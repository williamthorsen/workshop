import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';

/** Returns the positional-name placeholder, bracketed when `kits` contains a default. */
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
  packageKits?: string[];
  availablePackages?: string[];
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
  packageKits = [],
  availablePackages = [],
}: OwnerViewOptions): string {
  if (internalKits.length === 0 && compiledKits.length === 0 && packageKits.length === 0) {
    // A project with no kits of its own is still told what its dependencies offer, which is the one
    // thing that turns an empty listing into a next step.
    return availablePackages.length === 0
      ? formatEmpty('owner')
      : [formatEmpty('owner'), formatAvailableSection(availablePackages)].join('\n');
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

  if (packageKits.length > 0) {
    sections.push(formatSection('Packages', 'rdy run --packages', packageKits, 'docCompiled'));
  }

  if (availablePackages.length > 0) {
    sections.push(formatAvailableSection(availablePackages));
  }

  return sections.join('\n');
}

/** Returns the section naming installed packages that publish kits the config does not list. */
function formatAvailableSection(availablePackages: string[]): string {
  return formatSection('Available', 'Add to "packages" in the readyup config', availablePackages, 'docInternal');
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
 * Returns a heading naming the manifest, then one line per kit.
 *
 * A kit's line carries its version as a parenthetical and its description as inline detail, each present
 * only when the manifest records it. The `readyup` label distinguishes the runner's version from a
 * version the kit might declare for itself.
 */
export function formatManifestView({ kits, manifestPath }: ManifestViewOptions): string {
  if (kits.length === 0) {
    return `No kits found in manifest: ${manifestPath}`;
  }

  const items = kits.map((kit) => {
    const versionSegment = kit.readyupVersion !== undefined ? ` (readyup v${kit.readyupVersion})` : '';
    return getLayout().formatCheckLine({
      token: 'docCompiled',
      name: `${kit.name}${versionSegment}`,
      ...(kit.description !== undefined && { detail: kit.description }),
    });
  });

  return [...getLayout().formatHeading(`Manifest: ${manifestPath}`, 'section'), ...items].join('\n');
}

// -- Helpers --

/**
 * Returns a titled section, opening with a blank line: the title, `hint` indented beneath it, then the kits.
 *
 * `hint` sits against the title with no blank between them, so the command reads as part of the heading.
 */
function formatSection(title: string, hint: string, kits: string[], token: TokenName): string {
  const items = kits.map((name) => getLayout().formatCheckLine({ token, name }));
  return ['', getLayout().formatHeadingLine(title, 'section'), `${getLayout().indent(1)}${hint}`, '', ...items].join(
    '\n',
  );
}
