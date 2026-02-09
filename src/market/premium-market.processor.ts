import { BaseProcessor } from '@Common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RedisService } from 'src/redis';
import { MarketProcessor } from './market.processor';
import { MarketType } from '@prisma/client';

@Processor('premium-market', {
  concurrency: 1,
})
export class PremiumMarketProcessor extends BaseProcessor {
  constructor(
    private readonly redis: RedisService,
    private readonly marketProcessor: MarketProcessor,
  ) {
    super(1, { loggerDefaultMeta: { processor: PremiumMarketProcessor.name } });
  }
  async process(job: Job) {
    const { eventId, eventExternalId, market } = job.data;

    const existsKey = `market:exists:${eventExternalId}:${market.marketId}`;
    const isExists = await this.redis.client.exists(existsKey);
    if (isExists) return;

    this.logger.debug(
      `[${market.marketName}] syncing premium market for event ${eventExternalId}`,
    );

    await this.marketProcessor.upsertMarket(
      eventId,
      {
        marketId: market.marketId,
        marketName: market.marketName,
        startTime: market?.startTime || Date.now(),
        runners: market.runners,
        type: MarketType.Premium,
      },
      eventExternalId,
    );
  }
}
