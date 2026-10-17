import { checkTestFileConventions } from '@williamthorsen/nmr/tests';

// Pass `checkTestFileConventions` the same directory names that the Vitest configs pass to `testCollectionExclude`.
// eslint-disable-next-line vitest/require-hook -- the call declares the suite, whereas the rule reads it as setup work.
checkTestFileConventions();
