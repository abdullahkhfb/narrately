import type {DebugErrorRecord} from './messages';

const nativeConsoleError = console.error;

export const DEBUG_ERRORS_STORAGE_KEY = 'debugErrors';

export type DebugErrorReporter = (error: DebugErrorRecord) => Promise<void>;

export function installDebugErrorCapture(
  source: string,
  reporter: DebugErrorReporter,
): void {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: Parameters<typeof console.warn>): void => {
    originalWarn.apply(console, args);
    void safelyReport(
      reporter,
      createDebugError(source, formatConsoleArguments(args), undefined, undefined, 'warning'),
    );
  };

  console.error = (...args: Parameters<typeof console.error>): void => {
    originalError.apply(console, args);
    void safelyReport(
      reporter,
      createDebugError(source, formatConsoleArguments(args), undefined, undefined, 'error'),
    );
  };

  globalThis.addEventListener('error', (event: ErrorEvent) => {
    const error = event.error;
    const message = error instanceof Error ? error.message : event.message;
    if (!message) {
      return;
    }

    void safelyReport(
      reporter,
      createDebugError(source, message, error instanceof Error ? error.stack : undefined, event),
    );
  });

  globalThis.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    void safelyReport(
      reporter,
      createDebugError(
        source,
        message,
        reason instanceof Error ? reason.stack : undefined,
      ),
    );
  });
}

export function isDebugErrorRecord(value: unknown): value is DebugErrorRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['timestamp'] === 'string' &&
    typeof record['source'] === 'string' &&
    typeof record['message'] === 'string' &&
    (record['level'] === undefined ||
      record['level'] === 'error' ||
      record['level'] === 'warning') &&
    (record['stack'] === undefined || typeof record['stack'] === 'string') &&
    (record['location'] === undefined || typeof record['location'] === 'string')
  );
}

function createDebugError(
  source: string,
  message: string,
  stack?: string,
  event?: ErrorEvent,
  level: DebugErrorRecord['level'] = 'error',
): DebugErrorRecord {
  const location = event?.filename
    ? `${event.filename}:${event.lineno}:${event.colno}`
    : undefined;

  return {
    timestamp: new Date().toISOString(),
    source,
    level,
    message: message.slice(0, 2000),
    ...(stack ? {stack: stack.slice(0, 8000)} : {}),
    ...(location ? {location: location.slice(0, 1000)} : {}),
  };
}

async function safelyReport(
  reporter: DebugErrorReporter,
  error: DebugErrorRecord,
): Promise<void> {
  try {
    await reporter(error);
  } catch (reportingError: unknown) {
    nativeConsoleError.call(
      console,
      'Narrately could not save a captured error.',
      reportingError,
    );
  }
}

function formatConsoleArguments(args: unknown[]): string {
  return args
    .map((value) => {
      if (value instanceof Error) {
        return value.stack ?? `${value.name}: ${value.message}`;
      }
      if (typeof value === 'string') {
        return value;
      }
      try {
        return JSON.stringify(value) ?? String(value);
      } catch {
        return String(value);
      }
    })
    .join(' ')
    .slice(0, 2000);
}
