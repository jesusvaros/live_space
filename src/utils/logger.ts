export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const redactSecrets = (value: unknown): unknown => {
  if (typeof value === 'string') {
    if (value.length > 24 && /^[A-Za-z0-9_\-]+$/.test(value)) {
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/key|token|secret|password/i.test(key)) {
        return [key, '[redacted]'];
      }
      return [key, redactSecrets(item)];
    });
    return Object.fromEntries(entries);
  }

  return value;
};

const toObjectContext = (value: unknown): LogContext =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as LogContext) : {};

export const serializeError = (error: unknown): LogContext => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'object' && error !== null) {
    return redactSecrets(error) as LogContext;
  }

  return { message: String(error) };
};

export class Logger {
  constructor(
    private readonly minLevel: LogLevel = 'info',
    private readonly baseContext: LogContext = {}
  ) {}

  child(context: LogContext): Logger {
    return new Logger(this.minLevel, { ...this.baseContext, ...context });
  }

  debug(message: string, context?: LogContext) {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.write('warn', message, context);
  }

  error(message: string, error?: unknown, context?: LogContext) {
    const payload = error ? { ...context, error: serializeError(error) } : context;
    this.write('error', message, payload);
  }

  private write(level: LogLevel, message: string, context?: LogContext) {
    if (levelWeight[level] < levelWeight[this.minLevel]) {
      return;
    }

    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...toObjectContext(redactSecrets({ ...this.baseContext, ...context })),
    });

    if (level === 'error') {
      console.error(entry);
      return;
    }

    if (level === 'warn') {
      console.warn(entry);
      return;
    }

    console.info(entry);
  }
}
