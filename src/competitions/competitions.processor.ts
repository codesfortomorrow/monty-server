import os from 'os';
import { BaseService, UtilsService } from '@Common';
import { sportConfigFactory } from '@Config';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
// import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom, timeout } from 'rxjs';
import { PrismaService } from 'src/prisma';
import {
  ICompetition,
  RemoteResponse,
  RemoteSeries,
} from './competitions.type';
import { Provider, ProviderType, SportType, StatusType } from '@prisma/client';
import { getSportEnum } from 'src/utils/sports';
import { AlertService } from 'src/alert/alert.service';

@Injectable()
export class CompetitionsProcessor extends BaseService {
  private readonly SLEEP_BETWEEN_REQUESTS_MS = 2000; // 2 seconds
  private readonly REQUEST_TIMEOUT_MS = 5000; // 5 seconds

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,
    private readonly alertService: AlertService,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: CompetitionsProcessor.name } });
  }

  /**
   * Run every 5 hours
   */
  /**
   * Fetch Competitions and Events of default provider
   */
  // @Cron(CronExpression.EVERY_5_HOURS)
  async fetchCompetitionAndEventsOfDeafultProvider() {
    if (!this.utils.isMaster()) return;
    this.logger.info('🏁 Starting Sports Data Processor...');
    await this.syncDefaultProvider();
    this.logger.info('✅ Sports Data Processor completed successfully.');
  }

  async fetchRaceMarketCompttionAndEvents() {
    if (!this.utils.isMaster()) return;
    this.logger.info('🏁 Race Competition sync started');
    await this.syncRaceMarketCompttionAndEvents();
    this.logger.info('✅  Race  Competition sync finished');
  }

  async syncDefaultProvider() {
    const baseUrl = this.sportConfig.sportBaseUrl;
    const sports = this.sportConfig.sports;

    if (!baseUrl || !sports)
      throw new Error(
        'Base Url or Sports are not configured, aborting competition sync',
      );

    await this.utils.batchable(
      Object.entries(sports),
      async ([sportName, sportId]) => {
        if (sportId == 7 || sportId == 4339) {
          return;
        }

        await this.utils.rerunnable(async () => {
          await this.processSport(baseUrl, sportName, sportId);
        }, 3);
      },
    );
  }
  async syncRaceMarketCompttionAndEvents() {
    const baseUrl = this.sportConfig.sportBaseUrl;
    const sports = this.sportConfig.sports;

    if (!baseUrl || !sports) {
      throw new Error(
        'Base Url or Sports are not configured, aborting competition sync',
      );
    }

    await this.utils.batchable(
      Object.entries(sports),
      async ([sportName, sportId]) => {
        // ✅ Only allow Horse Racing (7) & Greyhound (4339)
        if (sportId !== 7 && sportId !== 4339) {
          return; // <-- THIS replaces continue
        }

        await this.utils.rerunnable(async () => {
          await this.processRaceSport(baseUrl, sportName, sportId);
        }, 3);
      },
    );
  }

  private async processSport(
    baseUrl: string,
    sportName: string,
    sportId: number,
  ) {
    const url = `${baseUrl}/event/get-series-redis/${sportId}`;
    this.logger.info(`📦 Fetching ${sportName} data from ${url}`);

    let response: RemoteResponse | null = null;

    try {
      response = await this.utils.rerunnable(async () => {
        const res = await firstValueFrom(
          this.http
            .get<RemoteResponse>(url)
            .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
        );
        return res.data;
      }, 3);
    } catch (error) {
      // Call Alert Service
      this.alertService.notifyApiFailure({
        url,
        meta: {
          'Sport Name': sportName,
          'Sport Id': sportId,
        },
        error: error.message,
      });
    }

    const competitions = response?.data ?? [];
    if (!competitions.length) {
      this.logger.warn(`⚠️ No competitions found for ${sportName}`);
      return;
    }

    await this.utils.batchable(competitions, async (comp) => {
      await this.upsertCompetitionAndEvents(sportName, comp);
      await this.utils.sleep(this.SLEEP_BETWEEN_REQUESTS_MS);
    });
  }
  private async processRaceSport(
    baseUrl: string,
    sportName: string,
    sportId: number,
  ) {
    const url = `${baseUrl}/event/by-provider?sportId=${sportId}&providerId=2&competitionId=%20`;
    this.logger.info(`📦 Fetching ${sportName} data from ${url}`);

    let response: RemoteResponse | null = null;

    try {
      response = await this.utils.rerunnable(async () => {
        const res = await firstValueFrom(
          this.http
            .get<RemoteResponse>(url)
            .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
        );
        return res.data;
      }, 3);
    } catch (error) {
      // Call Alert Service
      this.alertService.notifyApiFailure({
        url,
        meta: {
          'Sport Name': sportName,
          'Sport Id': sportId,
        },
        error: error.message,
      });
    }

    const competitions = response?.data ?? [];
    if (!competitions.length) {
      this.logger.warn(`⚠️ No competitions found for ${sportName}`);
      return;
    }

    await this.utils.batchable(competitions, async (comp) => {
      await this.upsertCompetitionAndEvents(sportName, comp);
      await this.utils.sleep(this.SLEEP_BETWEEN_REQUESTS_MS);
    });
  }
  private async upsertCompetitionAndEvents(
    sportName: string,
    comp: RemoteSeries,
    providerId?: number,
  ) {
    try {
      const competition = await this.prisma.competition.upsert({
        where: {
          externalId_name: {
            externalId: comp.competition.id,
            name: comp.competition.name,
          },
        },
        update: {
          sport: getSportEnum(sportName),
          updatedAt: new Date(),
        },
        create: {
          externalId: comp.competition.id,
          name: comp.competition.name,
          sport: getSportEnum(sportName),
          status: StatusType.Active,
          providerId,
        },
      });

      const matches = Array.isArray(comp.match) ? comp.match : [];

      if (matches.length > 0) {
        const status =
          getSportEnum(sportName) !== SportType.Cricket
            ? StatusType.Inactive
            : StatusType.Active;

        await this.utils.batchable(
          matches,
          async (m) => {
            await this.prisma.event.upsert({
              where: {
                competitionId_externalId: {
                  competitionId: competition.id,
                  externalId: m.event.id,
                },
                NOT: {
                  status: StatusType.Closed,
                },
              },
              update: {
                startTime: new Date(m.event.openDate),
                sport: getSportEnum(sportName),
                status: status,
                updatedAt: new Date(),
              },
              create: {
                externalId: m.event.id,
                name: m.event.name,
                startTime: new Date(m.event.openDate),
                sport: getSportEnum(sportName),
                competitionId: competition.id,
                providerId,
                status: status,
                isFancy: false,
                isBookmaker: false,
                isPopular: false,
              },
            });
          },
          os.availableParallelism() / 2,
        );
      }

      this.logger.info(
        `Synced ${matches.length} Events (Sprot = ${sportName}) for competition ${competition.externalId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error to upsert competition & event. error: ${error.message}`,
      );
    }
  }
}
