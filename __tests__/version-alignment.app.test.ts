import { checkNodeVersionConsistency, findMonorepoRoot } from '@williamthorsen/nmr/tests';

const monorepoRoot = findMonorepoRoot();

checkNodeVersionConsistency(monorepoRoot);
