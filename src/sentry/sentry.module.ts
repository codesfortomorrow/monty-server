import { Module, Global } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { initSentry } from 'src/configs/sentry.config';

@Global()
@Module({
  providers: [
    {
      provide: 'SENTRY',
      useFactory: async () => {
        initSentry();
        return Sentry;
      },
    },
  ],
  exports: ['SENTRY'],
})
export class SentryModule {}
