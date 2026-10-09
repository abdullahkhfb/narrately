/* tslint:disable */
/* eslint-disable */

export function build_cache_key(text: string, voice_id: string, speed: number): string;

export function chunk_text(text: string, max_chars: number): string;

export function default_voice_catalog(): string;

export function validate_synthesis_request(text: string, voice_id: string, speed: number): string;

export function validate_voice_embedding(values: Float32Array): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly build_cache_key: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly chunk_text: (a: number, b: number, c: number) => [number, number];
    readonly default_voice_catalog: () => [number, number];
    readonly validate_synthesis_request: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly validate_voice_embedding: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
