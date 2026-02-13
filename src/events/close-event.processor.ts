import { BaseProcessor } from '@Common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RedisService } from 'src/redis';
import { StatusType } from '@prisma/client';
import { PrismaService } from 'src/prisma';

@Processor('close-event', {
  concurrency: 1,
})
export class CloseEventProcessor extends BaseProcessor {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {
    super(1, { loggerDefaultMeta: { processor: CloseEventProcessor.name } });
  }
  async process(job: Job) {
    const { eventExternalId } = job.data;

    const existsKey = `event:closed:${eventExternalId}`;
    const isExists = await this.redis.client.exists(existsKey);
    if (isExists) return;

    this.logger.info(`Closing event for eventId ${eventExternalId}`);

    try {
      const updateCount = await this.prisma.event.updateMany({
        where: {
          externalId: eventExternalId,
        },
        data: {
          status: StatusType.Closed,
        },
      });

      if (updateCount.count > 0) {
        this.logger.info(`Closed event for eventId ${eventExternalId}`);
        await this.redis.client.setex(existsKey, 1 * 60 * 60, 1);

        // Redis clear
        const fixtureKeys = `fixture:*`;
        const marketKeys = `market:exists:${eventExternalId}:*`;

        await this.redis.deleteKeysByPattern(fixtureKeys);
        await this.redis.deleteKeysByPattern(marketKeys);
      }
    } catch (error) {
      this.logger.error(
        `Error to closed event based on market status: ${error.message}`,
      );
    }
  }
}
