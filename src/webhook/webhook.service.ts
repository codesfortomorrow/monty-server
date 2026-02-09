import { BaseService } from '@Common';
import { Injectable } from '@nestjs/common';
import { WebhookMarketResultDto } from './webhook-bet-result.request';
import { BetResultService } from 'src/bet-result/bet-result.service';

@Injectable()
export class WebhookService extends BaseService {
  constructor(private readonly betResultService: BetResultService) {
    super({ loggerDefaultMeta: { service: WebhookService.name } });
  }

  async processWebhookResults(
    payload: WebhookMarketResultDto[] | WebhookMarketResultDto,
  ) {
    if (!payload) {
      this.logger.warn('Webhook payload empty');
      return;
    }

    // Normalize to array
    const results = Array.isArray(payload) ? payload : [payload];

    // Loop through each result
    for (const result of results) {
      try {
        await this.betResultService.handleMarketResult(result);
      } catch (err) {
        this.logger.error(
          `Error processing result (eventId=${result.eventId}) \n payload: ${JSON.stringify(payload, null, 2)} \n ${err.stack || err}`,
        );
      }
    }
  }
}
