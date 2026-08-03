import { defineConfig } from '@williamthorsen/release-kit/config';

const config = defineConfig({
  releaseNotes: {
    shouldInjectIntoReadme: true,
  },
  repoLabels: {
    extends: ['common'],
    labels: {
      'scope:root': { color: '00ff96', description: '' },
      'scope:compositor': { color: '00ff96', description: '' },
      'scope:overlay': { color: '00ff96', description: '' },
      'scope:readyup': { color: '00ff96', description: '' },
    },
  },
});

export default config;
