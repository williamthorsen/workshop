import type { SecretStore, WritableSecretStore } from '@williamthorsen/toolbelt.secrets/candidate';

import type { RunEffects } from './RunEffects.ts';

/**
 * Wraps the keychain so that it is opened on first use rather than on construction. A run authenticated from
 * the environment then never opens the keychain, and a platform without one is reported only when a caller
 * actually reads from it.
 *
 * @internal
 */
export function createDeferredStore(effects: RunEffects): SecretStore {
  let opened: WritableSecretStore | undefined;

  /** Opens the keychain on the first call and returns that store on every later one. */
  function open(): WritableSecretStore {
    return (opened ??= effects.createStore());
  }

  return {
    deleteSecret: (query) => open().deleteSecret(query),
    findSecret: (query) => open().findSecret(query),
    hasSecret: (query) => open().hasSecret(query),
  };
}
