import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { httpIntegration, expressIntegration } from '@sentry/node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️ Sentry DSN not found — skipping Sentry initialization.');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(), // CPU & memory profiling
      httpIntegration(), // Outgoing HTTP tracing
      expressIntegration(), // Incoming request tracing

      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],

    tracesSampleRate: 1.0, // Capture 100% of transactions
    profileSessionSampleRate: 1.0, // Capture 100% of profiles
    profileLifecycle: 'trace', // Profile linked to transactions
    sendDefaultPii: true, // Include user info for better debugging
    enableLogs: true, // Log Sentry SDK messages to console
  });

  console.log('✅ Sentry initialized');
}

export { Sentry };
