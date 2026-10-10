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
      'scope:git-tools': { color: '00ff96', description: '' },
      'scope:nodejs-tools': { color: '00ff96', description: '' },
      'scope:overlay': { color: '00ff96', description: '' },
      'scope:readyup': { color: '00ff96', description: '' },
      'scope:repo-tools': { color: '00ff96', description: '' },
      'scope:secret-tools': { color: '00ff96', description: '' },
    },
  },
});

export default config;
