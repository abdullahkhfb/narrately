declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*?url' {
  const url: string;
  export default url;
}

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  /** Test-only override for the model download origin. */
  readonly VITE_MODEL_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
