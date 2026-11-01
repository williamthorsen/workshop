import type { VoiceConfig } from '../config/read-machine-config.ts';

/** A validated voice command for the entry point to perform. */
export type VoiceRequest =
  | { readonly kind: 'microphones'; readonly home: string }
  | { readonly kind: 'record'; readonly microphone: string | undefined; readonly voice: VoiceConfig }
  | { readonly kind: 'setup'; readonly voice: VoiceConfig };
