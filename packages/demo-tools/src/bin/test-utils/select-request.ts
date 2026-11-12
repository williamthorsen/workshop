import type { RevoiceRequest } from '../../voice/revoice-request.ts';
import type { VoiceRequest } from '../../voice/voice-request.ts';
import type { Launch, RunRequest } from '../run.ts';

/** Returns the requested launch, or `undefined` when the request is absent or of another kind. */
export function selectLaunch(request: RunRequest | undefined): Launch | undefined {
  return request?.kind === 'launch' ? request.launch : undefined;
}

/** Returns the requested revoice, or `undefined` when the request is absent or of another kind. */
export function selectRevoice(request: RunRequest | undefined): RevoiceRequest | undefined {
  return request?.kind === 'revoice' ? request.revoice : undefined;
}

/** Returns the requested voice command, or `undefined` when the request is absent or of another kind. */
export function selectVoice(request: RunRequest | undefined): VoiceRequest | undefined {
  return request?.kind === 'voice' ? request.voice : undefined;
}
