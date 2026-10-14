/**
 * @fileoverview Strips `powerPreference` from WebGPU `requestAdapter()` calls
 * on Windows so Chromium does not emit https://crbug.com/369219127 warnings,
 * while preserving `powerPreference` on platforms that honor it.
 */

interface AdapterOptions {
  readonly powerPreference?: unknown;
  readonly [key: string]: unknown;
}

interface GpuLike {
  requestAdapter?: (options?: Record<string, unknown>) => Promise<unknown>;
}

interface NavigatorWithPlatform extends Navigator {
  readonly userAgentData?: {
    readonly platform?: string;
  };
  readonly gpu?: GpuLike;
}

let installed = false;

function isWindowsPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const nav = navigator as NavigatorWithPlatform;
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /win/i.test(platform) || /windows/i.test(nav.userAgent);
}

const STRIP_POWER_PREFERENCE = isWindowsPlatform();

function sanitizeOptions(
  options: AdapterOptions | undefined,
): Record<string, unknown> | undefined {
  if (!options || typeof options !== 'object') {
    return undefined;
  }
  const sanitized: Record<string, unknown> = {};
  let hasKeys = false;
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }
    if (STRIP_POWER_PREFERENCE && key === 'powerPreference') {
      continue;
    }
    sanitized[key] = value;
    hasKeys = true;
  }
  return hasKeys ? sanitized : undefined;
}

function patchTarget(target: GpuLike): boolean {
  const nativeRequestAdapter = target.requestAdapter;
  if (typeof nativeRequestAdapter !== 'function') {
    return false;
  }
  const wrapped = function (
    this: unknown,
    options?: AdapterOptions,
  ): Promise<unknown> {
    const clean = sanitizeOptions(options);
    return clean
      ? nativeRequestAdapter.call(this, clean)
      : nativeRequestAdapter.call(this);
  };
  try {
    target.requestAdapter = wrapped;
    return true;
  } catch {
    try {
      Object.defineProperty(target, 'requestAdapter', {
        value: wrapped,
        configurable: true,
        writable: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/** Installs the WebGPU `requestAdapter` options sanitizer in the current context. */
export function installWebGpuAdapterPatch(): void {
  if (installed) {
    return;
  }
  installed = true;

  const gpuCtor = (globalThis as {GPU?: {prototype?: GpuLike}}).GPU;
  if (gpuCtor?.prototype) {
    patchTarget(gpuCtor.prototype);
  }
  if (typeof navigator !== 'undefined') {
    const gpu = (navigator as NavigatorWithPlatform).gpu;
    if (gpu) {
      patchTarget(gpu);
    }
  }
}

installWebGpuAdapterPatch();
