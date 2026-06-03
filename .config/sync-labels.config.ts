import type { SyncLabelsConfig } from '@williamthorsen/release-kit';

const config: SyncLabelsConfig = {
  presets: ['common'],
  labels: [
    { name: 'scope:root', color: '00ff96', description: 'Monorepo root configuration' },
    { name: 'scope:overlay', color: '00ff96', description: 'overlay package' },
    { name: 'scope:readyup', color: '00ff96', description: 'readyup package' },
  ],
};

export default config;
