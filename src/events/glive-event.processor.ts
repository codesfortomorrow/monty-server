import { BaseProcessor } from '@Common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GliveTvProcessor } from './glive-tv.processor';

@Processor('glive-event', {
  concurrency: 1,
})
export class GliveEventProcessor extends BaseProcessor {
  constructor(private readonly gliveTvProcessor: GliveTvProcessor) {
    super(1, { loggerDefaultMeta: { processor: GliveEventProcessor.name } });
  }
  async process(job: Job) {
    const { baseUrl, sportName, sportId, apiUserId, apiKey } = job.data;

    try {
      await this.gliveTvProcessor.processSport({
        baseUrl,
        sportName,
        sportId,
        apiUserId,
        apiKey,
      });
    } catch (error: any) {
      this.logger.error(`Error to sync glive event: ${error.message}`);
    }
  }
}
