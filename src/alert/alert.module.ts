import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { QueueModule } from 'src/queue';
import { MailModule } from 'src/mail';

@Module({
  imports: [QueueModule.registerAsync('mail-alert'), MailModule],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
