import { TOPICS } from './topics.ts';

/** The topic list that help output prints, rendered from the table so that the two cannot diverge. */
const TOPIC_LINES = Object.entries(TOPICS)
  .map(([topic, { summary }]) => `  ${topic.padEnd(30)}${summary}`)
  .join('\n');

/**
 * Where help output sends a reader for anything it does not cover.
 *
 * Help lists the surface; the doc files explain it, and the skill contains the authoring judgment that neither states. The
 * installed path leads because a reader in a consuming repo can open it without a fetch; the repository URL follows
 * for a global install, which has no such path.
 */
export const DOCS_POINTER = `Full documentation: node_modules/readyup/docs/
   Online: https://github.com/williamthorsen/workshop/tree/main/packages/readyup#readme
Authoring kits: the consult-readyup-kits skill`;

export const COMPILE_HELP = `
Usage: rdy compile [<file>] [options]

Bundle TypeScript kit(s) into self-contained ESM bundle(s).
If no file is given, the sources in the config's srcDir that compile.include and compile.exclude
select are compiled, and the bundles of kits that no source compiles to are removed.

Modes:
  rdy compile                  Compile the sources that the config selects
  rdy compile <file>           Compile a single file
  rdy compile --recursive      Compile the sources of every kit project below this directory

Options:
  --output, -o <path>        Output file path (single-file mode only)
  --manifest <path>          Manifest file path (default: .readyup/manifest.json); not with --recursive
  --config <path>            Config file path (default: .config/readyup.config.ts); not with <file>
                             or --recursive
  --recursive                Compile every kit project below the working directory, each under its
                             own config and manifest; not combinable with <file>, --output,
                             --manifest, or --config
  --force                    Overwrite or remove compiled kits even if they have drifted from the manifest
  --json                     Report each kit's status, any removed bundles, and any warnings, as JSON
  --skip-manifest            Do not read or write the manifest
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

${DOCS_POINTER}
`;

export const HELP = `
Usage: rdy [kit[:checklist,...] ...] [options]
       rdy <command> [options]

Commands:
  run [kit[:checklist,...] ...]  Run rdy checklists (default)
  compile [file]                Bundle TypeScript kit(s) into self-contained ESM file(s)
  help [<topic>]                Show help for a command or a topic
  init                          Scaffold a starter config and kit
  list                          List available kits
  verify                        Check compiled kits against manifest hashes

Topics:
${TOPIC_LINES}

Run options:
  --from <source>                    Kit source (github:org/repo, bitbucket:ws/repo, npm:package, global, dir:path, or local path)
  --file, -f <path>                  Path to a local kit file
  --url <url>                        Fetch kit from a URL
  --packages [<kit>]                 Run a kit published by the config's "packages" list (default: "default")
  --jit                              Run from TypeScript source instead of compiled JS
  --internal                         Use internal kit directory and infix from config
  --all                              Run every kit in the selected source instead of naming kits
  --checklists, -c <checklist,...>   Filter checklists within the selected kit
  --config <path>                    Config file path (default: .config/readyup.config.ts)
  --json                             Output results as JSON
  --detail <summary|full>            How much of the JSON report to emit (default: full); requires --json
  --diagnose                         Report skipped checks whose check would have passed
  --fail-on <severity>               Fail on this severity or above (error, warn, recommend)
  --no-cache                         Fetch remote kits and manifests again, ignoring cached copies
  --quiet                            Hide passed checks from the report; incompatible with --json
  --report-on <severity>             Show this severity or above (error, warn, recommend)

Global options:
  --style <auto|plain|rich>  Output style: emoji, ASCII words, or detected (default: auto)
  --help, -h                 Show this help message
  --version, -V              Show version number

Run 'rdy <command> --help' for command-specific options.
Run 'rdy help <topic>' to read a topic.

Examples:
  rdy                                              Run every checklist in the default kit
  rdy deploy                                       Run the compiled deploy kit
  rdy deploy:build,test                            Run two checklists from the deploy kit
  rdy run --jit deploy                             Run the deploy kit from its TypeScript source
  rdy init                                         Scaffold a starter config and kit
  rdy help concepts                                Read the concepts documentation
  rdy compile                                      Compile every kit source into a bundle
  rdy compile --recursive                          Compile the kits of every project below this directory
  rdy list --from github:williamthorsen/workshop   List kits published by a repository

${DOCS_POINTER}
`;

export const INIT_HELP = `
Usage: rdy init [options]

Scaffold a starter config and kit file.

Options:
  --dry-run, -n              Preview changes without writing files
  --force                    Overwrite existing files
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

${DOCS_POINTER}
`;

export const LIST_HELP = `
Usage: rdy list [options]

List available kits without running them.

Modes:
  rdy list                                  List internal and compiled kits (owner view)
  rdy list --packages                       List the kits published by this project's dependencies
  rdy list --recursive                      List compiled kits in every project below this directory
  rdy list --recursive --packages           List each project's kit-publishing dependencies
  rdy list --from <path>                    List compiled kits at a local path (consumer view)
  rdy list --from npm:package               List the kits published by an installed package
  rdy list --from global                    List compiled kits in the global directory
  rdy list --from dir:<path>                List kits in an arbitrary directory
  rdy list --from github:org/repo[@ref]     List kits in a remote GitHub repository
  rdy list --from bitbucket:ws/repo[@ref]   List kits in a remote Bitbucket repository

Options:
  --config <path>            Config file path (default: .config/readyup.config.ts); not combinable
                             with --from, --manifest, or --recursive
  --from <source>            Kit source (github:org/repo[@ref], bitbucket:ws/repo[@ref], npm:package,
                             global, dir:path, or local path)
  --manifest <path>          List the kits declared by a manifest file
  --no-cache                 Fetch a remote manifest again, ignoring a cached copy; the fresh
                             copy still replaces the cached one
  --packages                 List every installed dependency that publishes kits, with the kits
                             that each publishes and the command that runs them; combines with
                             --recursive, not with --from or --manifest
  --recursive                List compiled kits in every project below the working directory,
                             grouped by project; with --packages, lists each project's
                             kit-publishing dependencies instead; not combinable with --from,
                             --manifest, or --config
  --json                     Output the kit list as JSON
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

Examples:
  rdy list                                         Show kits in the current project
  rdy list --packages                              Show what this project's dependencies publish
  rdy list --recursive                             Show compiled kits across the whole repository
  rdy list --recursive --packages                  Show every project's kit-publishing dependencies
  rdy list --from .                                Show compiled kits in the current directory
  rdy list --from global                           Show kits in the global directory
  rdy list --from github:williamthorsen/workshop   Show kits in a remote GitHub repository
  rdy list --from bitbucket:tutorials/markdowndemo@master Show kits in a remote Bitbucket repository

${DOCS_POINTER}
`;

export const RUN_HELP = `
Usage: rdy run [kit[:checklist,...] ... | --all] [options]

Run rdy checklists. Positional arguments select kits to run; use colon syntax
to filter checklists within a kit (e.g., deploy:check1,check2).
If no arguments are given, all checklists in the default kit are run.
--all runs every kit in the selected source instead.

Kit source (mutually exclusive):
  --from <source>                    Kit source (github:org/repo[@ref], bitbucket:ws/repo[@ref],
                                     npm:package, global, dir:path, or local repo path)
  --file, -f <path>                  Path to a local kit file
  --url <url>                        Fetch kit from a URL
  --packages [<kit>]                 Run a kit from every package that the config's "packages"
                                     list names, skipping those that do not publish it;
                                     without a kit, the kit named "default"

Mode flags (incompatible with --from, --file, --url, --packages):
  --jit                              Run from TypeScript source instead of compiled JS
  --internal                         Use internal kit directory and infix from config

Options:
  --all                              Run every kit in the selected source instead of naming kits;
                                     not combinable with kit names, --checklists, --file, or --url
  --checklists, -c <checklist,...>   Filter checklists within the selected kit; requires a
                                     single kit and no ":" filter on it
  --config <path>                    Config file path (default: .config/readyup.config.ts); not
                                     combinable with --file, --from, or --url
  --json                             Output results as JSON
  --detail <summary|full>            How much of the JSON report to emit (default: full); requires --json
  --diagnose                         Report skipped checks whose check would have passed
  --fail-on <severity>               Fail on this severity or above (error, warn, recommend)
  --no-cache                         Fetch remote kits and manifests again, ignoring cached copies;
                                     the fresh copies still replace the cached ones
  --quiet                            Hide passed checks from the report; incompatible with --json
  --report-on <severity>             Show this severity or above (error, warn, recommend)
  --style <auto|plain|rich>          Output style (default: auto)
  --help, -h                         Show this help message

Positional args accept relative paths (e.g., shared/deploy). A name containing a '..'
segment, an absolute path, or a leading separator is rejected; use --file or
--from dir: to run a kit from outside the kit directory.

A name resolves against the config's compile.outDir, or compile.srcDir under --jit;
--internal shifts it by internal.dir and internal.infix without changing that root.
--all --jit runs the sources that compile.include and compile.exclude select, which
is the set that rdy compile builds.
Defaults to the kit named "default" when no source is given.

To pass a positional argument that starts with a '-', place it at the end of the command
after '--', as in: rdy run -- "--odd-kit-name"

Examples:
  rdy run                                Run every checklist in the default kit
  rdy run deploy                         Run the compiled deploy kit
  rdy run deploy:build,test              Run two checklists from the deploy kit
  rdy run --all                          Run every compiled kit in the project
  rdy run --all --packages               Run every kit that the configured packages publish
  rdy run --jit deploy                   Run the deploy kit from its TypeScript source
  rdy run --from global deploy           Run the deploy kit from the global directory
  rdy run --fail-on warn                 Fail the run on warnings as well as errors
  rdy run --quiet                        Report only what is not passing
  rdy run --diagnose                     Report skips whose check would have passed
  rdy run --json --detail summary        Emit a JSON report with only failed checks

${DOCS_POINTER}
`;

export const VERIFY_HELP = `
Usage: rdy verify [options]

Check compiled kits against the hashes recorded in the manifest.

Options:
  --manifest <path>          Manifest file path (default: .readyup/manifest.json)
  --json                     Report each kit's verification status as JSON
  --rebuild                  Also recompile each kit and compare it to the committed bundle;
                             requires esbuild
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

${DOCS_POINTER}
`;

/** Help text for each command, keyed by the name that selects it. */
export const COMMAND_HELP: Readonly<Record<string, string>> = {
  compile: COMPILE_HELP,
  help: HELP,
  init: INIT_HELP,
  list: LIST_HELP,
  run: RUN_HELP,
  verify: VERIFY_HELP,
};
