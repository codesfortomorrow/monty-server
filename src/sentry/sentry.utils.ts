import * as Sentry from '@sentry/nestjs';

export const reportToSentry = async (
  error: unknown,
  context?: Record<string, any>,
): Promise<void> => {
  if (!process.env.SENTRY_DSN) {
    console.warn('[Sentry disabled] Error:', error);
    return;
  }

  try {
    if (context) {
      Sentry.setContext('manual_context', context);
    }

    Sentry.captureException(error);

    await Sentry.flush(2000);
  } catch (flushError) {
    console.error('[Sentry flush failed]:', flushError);
  }
};

export async function trackPerformance<T>(
  name: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  return await Sentry.startSpan({ name, op: operation }, async () => {
    try {
      return await fn();
    } catch (error) {
      await reportToSentry(error, { name, operation });
      throw error;
    }
  });
}
