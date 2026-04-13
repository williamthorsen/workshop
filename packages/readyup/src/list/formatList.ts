const ICON_INTERNAL = '📄';
const ICON_COMPILED = '📦';

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
}

/**
 * Format the owner-mode output showing internal and compiled kit sections.
 *
 * Empty sections are omitted. Returns the empty-owner message when both lists are empty.
 */
export function formatOwnerView({ internalKits, compiledKits, compiledStyle }: OwnerViewOptions): string {
  if (internalKits.length === 0 && compiledKits.length === 0) {
    return formatEmpty('owner');
  }

  const sections: string[] = [];

  if (internalKits.length > 0) {
    const hint = `rdy run --jit ${buildKitHint(internalKits)}`;
    sections.push(formatSection('Internal', hint, internalKits, ICON_INTERNAL));
  }

  if (compiledKits.length > 0) {
    if (compiledStyle.kind === 'local-convention') {
      const hint = `rdy run ${buildKitHint(compiledKits)}`;
      sections.push(formatSection('Compiled', hint, compiledKits, ICON_COMPILED));
    } else {
      const hint = `rdy run --file <file path>`;
      const pathItems = compiledKits.map((name) => `${compiledStyle.outDirRel}/${name}.js`);
      sections.push(formatSection('Compiled', hint, pathItems, ICON_COMPILED));
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
  return formatSection('Compiled', hint, compiledKits, ICON_COMPILED);
}

// -- Empty messages --

/** Format the "no kits found" message appropriate to the given mode. */
export function formatEmpty(mode: 'owner' | 'consumer', kitsDir?: string): string {
  if (mode === 'consumer') {
    return `No compiled kits found at ${kitsDir ?? '.readyup/kits'}.`;
  }
  return 'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.';
}

// -- Helpers --

/** Build a titled section with a usage hint and indented item list. */
function formatSection(title: string, hint: string, kits: string[], icon: string): string {
  const items = kits.map((name) => `  ${icon} ${name}`);
  return `${title}: ${hint}\n${items.join('\n')}`;
}
