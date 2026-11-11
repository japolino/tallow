/** The room's model files, put into the frontend bundle by scripts/build.ts: base64 by file name. */
declare module "tallow:models" {
  export const MODELS: Record<string, string>;
}

/** The room's recorded sounds, put into the frontend bundle by scripts/build.ts: base64 by file name. */
declare module "tallow:sounds" {
  export const SOUNDS: Record<string, string>;
}
