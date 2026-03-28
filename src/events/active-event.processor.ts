import { BaseProcessor } from '@Common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RedisService } from 'src/redis';
import { ResultProvider, StatusType } from '@prisma/client';
import { PrismaService } from 'src/prisma';

@Processor('active-event', {
  concurrency: 1,
})
export class ActiveEventProcessor extends BaseProcessor {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {
    super(1, { loggerDefaultMeta: { processor: ActiveEventProcessor.name } });
  }
  async process(job: Job) {
    const { eventExternalId, activatedBy } = job.data;

    const existsKey = `event:active:${eventExternalId}`;
    const isExists = await this.redis.client.exists(existsKey);
    if (isExists) return;

    this.logger.info(`Activating event for eventId ${eventExternalId}`);

    try {
      const updated = await this.prisma.event.updateMany({
        where: {
          externalId: eventExternalId,
          NOT: {
            status: StatusType.Closed,
            statusUpdatedBy: ResultProvider.Panel,
          },
        },
        data: {
          status: StatusType.Active,
          statusUpdatedBy: activatedBy ?? ResultProvider.Webhook,
        },
      });
      if (updated.count > 0) {
        this.logger.info(`Activated event for eventId ${eventExternalId}`);
        await this.redis.client.setex(existsKey, 15 * 60, 1);
      }
    } catch (error: any) {
      this.logger.error(
        `Error to activate event based on mqtt market: ${error.message}`,
      );
    }
  }
}
