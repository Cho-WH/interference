export const PLAYBACK_RATES = [.25, .5, 1, 1.5, 2] as const;
export type PlaybackRate = typeof PLAYBACK_RATES[number];
export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;
