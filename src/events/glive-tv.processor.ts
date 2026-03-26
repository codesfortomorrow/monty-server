import { BaseService, UtilsService } from '@Common';
import { scorecardConfigFactory, sportConfigFactory } from '@Config';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GliveEvent, GliveEventResponse } from './events.type';
import { firstValueFrom, timeout } from 'rxjs';
import { AlertService } from 'src/alert/alert.service';
import { PrismaService } from 'src/prisma';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getGliveSportName } from 'src/utils/sports';

@Injectable()
export class GliveTvProcessor
  extends BaseService
  implements OnApplicationBootstrap
{
  private isRunning = false;
  private readonly REQUEST_TIMEOUT_MS = 10000; // 10 seconds
  private readonly SLEEP_BETWEEN_REQUESTS_MS = 2000; // 2 seconds
  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
    private readonly alertService: AlertService,
    @Inject(scorecardConfigFactory.KEY)
    private readonly config: ConfigType<typeof scorecardConfigFactory>,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
    @InjectQueue('glive-event')
    private readonly gliveEventQueue: Queue,
  ) {
    super({ loggerDefaultMeta: { processor: GliveTvProcessor.name } });
  }
  onApplicationBootstrap() {
    this.initGlive();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  initGlive() {
    if (!this.utils.isMaster()) return;
    try {
      this.fetchGliveMatch();
    } catch (error) {
      this.logger.error(`Glive Match syncing faild`, error);
    }
  }

  async fetchGliveMatch() {
    if (this.isRunning) return;
    try {
      this.isRunning = true;
      const baseUrl = this.config.gliveTvUrl;
      const apiUserId = this.config.gliveUserId;
      const apiKey = this.config.gliveApiKey;

      if (!baseUrl || !apiUserId || !apiKey)
        throw new Error('Glive base url is not configured');

      const sports = this.sportConfig.sports;

      if (!sports) throw new Error('Sports are not configured');

      await this.utils.batchable(
        Object.entries(sports),
        async ([sportName, sportId]) => {
          // await this.processSport({
          //   baseUrl,
          //   sportName,
          //   sportId,
          //   apiUserId,
          //   apiKey,
          // });
          await this.sendGliveEventToQueue({
            baseUrl,
            sportName,
            sportId,
            apiUserId,
            apiKey,
          });
        },
      );
    } catch (error: any) {
      this.logger.error(
        `Error to get match for glive, Error = ${error.message}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  async sendGliveEventToQueue(data: {
    baseUrl: string;
    sportName: string;
    sportId: number;
    apiUserId: string;
    apiKey: string;
  }) {
    try {
      await this.gliveEventQueue.add('glive-tv', data, {
        jobId: `glive-${data.sportName}`,
      });
    } catch (error) {
      this.logger.error(
        `Error to initialize glive event sync job for ${data.sportName}, ${error}`,
      );
    }
  }

  async processSport(data: {
    baseUrl: string;
    sportName: string;
    sportId: number;
    apiUserId: string;
    apiKey: string;
  }) {
    const gliveSportName = getGliveSportName(data.sportName);
    if (!gliveSportName) return;
    const url = `${data.baseUrl}/api.php?action=getmatch&apiuser=${data.apiUserId}&key=${data.apiKey}&sportstype=${gliveSportName.toUpperCase()}&format=JSON`;
    this.logger.info(`📦 Fetching ${data.sportName} data from ${url}`);

    let response: GliveEventResponse | null = null;
    try {
      response = await this.utils.rerunnable(async () => {
        const res = await firstValueFrom(
          this.http
            .get<GliveEventResponse>(url)
            .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
        );
        return res.data;
      }, 2);
    } catch (error: any) {
      this.logger.error(
        `Error from Glive Event fetch api, Error = ${error.message}`,
      );
      // Call Alert Service
      this.alertService.notifyApiFailure({
        url,
        meta: {
          'Sport Name': data.sportName,
          Source: GliveTvProcessor.name,
        },
        error: error.message,
      });
    }

    const matches = response?.Match ?? [];
    if (!matches.length) {
      this.logger.warn(`⚠️ No matches found for ${data.sportName}`);
      return;
    }

    await this.utils.batchable(matches, async (match) => {
      await this.upsertGliveEvents(match);
      //   await this.utils.sleep(this.SLEEP_BETWEEN_REQUESTS_MS);
    });
  }

  async upsertGliveEvents(match: GliveEvent) {
    try {
      await this.prisma.gliveEvent.upsert({
        where: {
          matchId: match.MatchID,
        },
        update: {
          eventName: match.Name,
          channel: match.Channel,
          startTime: new Date(Number(match.UTCTimeStart) * 1000),
          state: match.State,
          home: match.Home,
          away: match.Away,
          isLive: match.IsLive,
        },
        create: {
          matchId: match.MatchID,
          eventName: match.Name,
          channel: match.Channel,
          startTime: new Date(Number(match.UTCTimeStart) * 1000),
          state: match.State,
          home: match.Home,
          away: match.Away,
          isLive: match.IsLive,
          league: match.League,
          sport: match.Type,
        },
      });
    } catch (error: any) {
      this.logger.error(`Error to upsert glive event. error: ${error.message}`);
    }
  }
}
