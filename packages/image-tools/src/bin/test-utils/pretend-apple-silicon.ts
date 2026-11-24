// Preloaded with `--import` so that `thor-image generate` passes its platform check on any test host.
Object.defineProperties(process, {
  platform: { value: 'darwin' },
  arch: { value: 'arm64' },
});
