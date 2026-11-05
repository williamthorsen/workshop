/** A path that aidemo writes in each demo directory, and a file under it that stands for it in an ignore check. */
export interface AidemoWorkingPath {
  /** The path relative to the demo directory, as a warning names it and as a git pathspec matches it. */
  readonly label: string;
  /** A file that aidemo writes under the path, relative to the demo directory, which an ignore rule must cover. */
  readonly sample: string;
}

/**
 * The paths that aidemo writes in a demo directory on every run, none of which belongs in version control.
 * `generated/storyboard.json` and `golden/` are sources and are absent from the list.
 */
export const AIDEMO_WORKING_PATHS: readonly AidemoWorkingPath[] = [
  { label: '.chrome-profile-fresh/', sample: '.chrome-profile-fresh/Local State' },
  { label: 'audio/', sample: 'audio/voice.json' },
  { label: 'generated/captions.*', sample: 'generated/captions.srt' },
  { label: 'generated/params.json', sample: 'generated/params.json' },
  { label: 'generated/timeline*.json', sample: 'generated/timeline.json' },
  { label: 'logs/', sample: 'logs/render.log' },
  { label: 'output/', sample: 'output/final-demo.mp4' },
  { label: 'recordings/', sample: 'recordings/raw.webm' },
];
