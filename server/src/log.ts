// Structured stdout logger (story 0.3). One line per event:
// `level event {json-fields}` — no timestamp (the platform stamps stdout),
// no third-party log library, zero I/O beyond console.log. `debug` is the
// only gated level (HC_DEBUG=1), checked lazily at call time so tests can
// flip process.env.HC_DEBUG between calls without rebuilding anything.
//
// Everything spatial/gameplay stays out of this file by construction: it
// only ever receives whatever plain-object fields the caller (room/adapter
// layer) hands it. See CONFIG/CLAUDE.md — zero PII (player names, session
// ids) belongs in a telemetry line; that discipline is enforced by callers,
// not here.

export type LogFields = Record<string, unknown>;

type Level = 'info' | 'warn' | 'error' | 'debug';

/**
 * Renders one log line. Fields must serialize via JSON.stringify; if that
 * throws (e.g. a circular reference snuck into fields), fall back to a fixed
 * marker payload rather than let a logging call crash the caller.
 */
function formatLine(level: Level, event: string, fields: LogFields): string {
  let json: string;
  try {
    json = JSON.stringify(fields);
  } catch {
    json = '{"logError":"unserializable-fields"}';
  }
  return `${level} ${event} ${json}`;
}

function emit(level: Level, event: string, fields: LogFields): void {
  console.log(formatLine(level, event, fields));
}

export function logInfo(event: string, fields: LogFields = {}): void {
  emit('info', event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  emit('warn', event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  emit('error', event, fields);
}

/**
 * Gated by process.env.HC_DEBUG === '1', checked lazily on every call (not
 * cached at module load) so tests — and an operator flipping the env var on a
 * live process — see the change take effect immediately.
 */
export function logDebug(event: string, fields: LogFields = {}): void {
  if (process.env.HC_DEBUG !== '1') return;
  emit('debug', event, fields);
}

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  debug(event: string, fields?: LogFields): void;
}

/**
 * Merges bound `context` (and, if provided, a freshly-invoked `dynamic()`
 * result) into every line's fields. Call-site fields win on key collision;
 * dynamic fields win over bound context but lose to call-site fields. If
 * `dynamic` throws, the exception is swallowed and the line is emitted
 * without its fields — a broken tick-context getter must never take down a
 * log call (or the tick it's reporting on).
 */
export function createLogger(context: LogFields, dynamic?: () => LogFields): Logger {
  const merge = (fields: LogFields): LogFields => {
    let dynamicFields: LogFields = {};
    if (dynamic) {
      try {
        dynamicFields = dynamic();
      } catch {
        dynamicFields = {};
      }
    }
    return { ...context, ...dynamicFields, ...fields };
  };
  return {
    info: (event, fields = {}) => logInfo(event, merge(fields)),
    warn: (event, fields = {}) => logWarn(event, merge(fields)),
    error: (event, fields = {}) => logError(event, merge(fields)),
    debug: (event, fields = {}) => logDebug(event, merge(fields)),
  };
}
