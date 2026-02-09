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

  /**
   * Run every 5 hours
   */
  /**
   * Fetch Competitions of others provider
   */
  // @Cron(CronExpression.EVERY_5_HOURS)
  async handleCompetitionSync() {
    if (!this.utils.isMaster()) return;
    this.logger.info('🏁 Competition sync started');
    await this.syncOtherProviderCompetitions();
    this.logger.info('✅ Competition sync finished');
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

  async syncOtherProviderCompetitions() {
    const baseUrl = this.sportConfig.sportBaseUrl;
    const sports = this.sportConfig.sports;

    if (!baseUrl || !sports)
      throw new Error(
        'Base Url or Sports are not configured, aborting competition sync',
      );

    // fetch providers (exclude Sat Sports & BetFair)
    const providers = await this.prisma.provider.findMany({
      where: {
        providerType: ProviderType.Sports,
        isActive: true,
        name: { notIn: ['Sat Sports', 'BetFair'] },
      },
    });

    this.logger.info(`Found ${providers.length} providers to sync`);
    await this.utils.batchable(providers, async (provider) => {
      await this.utils.batchable(
        Object.entries(sports),
        async ([sportName, sportId]) => {
          if (sportId == 7 || sportId == 4339) {
            return;
          }

          await this.utils.rerunnable(async () => {
            await this.processOtherCompetition(
              baseUrl,
              sportName,
              sportId,
              provider,
            );
          }, 3);
        },
      );
    });
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
      // this.alertService.notifyApiFailure({
      //  //portName,
      //   //sportId,
      //   url,
      //   error: error.message,
      // });
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

  async processOtherCompetition(
    baseUrl: string,
    sportName: string,
    sportId: number,
    provider: Provider,
  ) {
    if (!provider.externalId) {
      this.logger.warn(
        `Skipping provider ${provider.name} (id=${provider.id}) - missing externalId`,
      );
      return;
    }
    // const url = `${baseUrl}/competition/by-providerId?sportId=${sportId}&providerId=${provider.externalId}`;
    const url = `${baseUrl}/event/by-provider?sportId=${sportId}&providerId=${provider.externalId}&competitionId=%20`;

    try {
      // use utils.rerunnable to call the 3rd party (with exponential backoff)
      let response: RemoteResponse | null = null;

      try {
        response = await this.utils.rerunnable(async () => {
          const resp = await firstValueFrom(
            this.http
              .get<RemoteResponse>(url)
              .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
          );
          return resp.data;
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

        this.logger.error(
          `Error to call third party api (Sport = ${sportName}), (url = ${url}) ${error.message}`,
        );
      }

      this.logger.info(
        `Third party response for ${provider.name} (Sport = ${sportName}) ${JSON.stringify(response, null, 2)}`,
      );

      const competitions = response?.data ?? [];

      if (!Array.isArray(competitions)) {
        this.logger.warn(
          `Provider ${provider.name} (${provider.externalId}) returned non-array for sport ${sportName}: ${JSON.stringify(
            competitions,
          )}`,
        );
        return;
      }

      // batch upsert using utils.batchable - concurrency tuned by utils.batchable implementation
      await this.utils.batchable(competitions, async (comp) => {
        // Use upsert with unique constraint (externalId + name)
        // await this.prisma.competition.upsert({
        //   where: {
        //     externalId_name: {
        //       externalId: comp.competitionId,
        //       name: comp.competitionName,
        //     },
        //   },
        //   create: {
        //     externalId: comp.competitionId,
        //     name: comp.competitionName,
        //     sport: getSportEnum(comp.sportName),
        //     status: StatusType.Active,
        //     providerId: provider.id,
        //   },
        //   update: {
        //     sport: getSportEnum(comp.sportName),
        //     status: StatusType.Active,
        //   },
        // });

        await this.upsertCompetitionAndEvents(sportName, comp, provider.id);
        await this.utils.sleep(this.SLEEP_BETWEEN_REQUESTS_MS);
      });

      this.logger.info(
        `Synced ${competitions.length} competitions for provider ${provider.name} (sport=${sportName})`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to sync competitions for provider ${provider.name} (sport=${sportName}): ${err?.message ?? err}`,
      );
    }
  }
}
