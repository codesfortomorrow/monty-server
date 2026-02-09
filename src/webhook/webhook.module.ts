import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { BetResultModule } from 'src/bet-result/bet-result.module';

@Module({
  imports: [BetResultModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
