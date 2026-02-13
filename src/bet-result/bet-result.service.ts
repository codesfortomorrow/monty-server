import { BaseService, Pagination } from '@Common';
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ResultProvider,
  ResultStatusType,
  StatusType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma';
import { WebhookMarketResult } from './bet-result.type';
import { EventsService } from 'src/events/events.service';
import { MarketService } from 'src/market/market.service';
import {
  BetResultRequest,
  CreateUserForResultPanelRequest,
  settleBetMarketRequest,
  UnsettleBetMarketRequest,
} from './dto';
import { ManualRollbackRequest } from './dto/manual-rollback.request';
import { targetMarkets } from 'src/utils/market';
import { RedisService } from 'src/redis';
import { UsersService } from 'src/users';

export interface HierarchyUser {
  id: number | null;
  ap: number;
  username: string;
  role: string;
}

@Injectable()
export class BetResultService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventsService,
    private readonly marketService: MarketService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
  ) {
    super({ loggerDefaultMeta: { service: BetResultService.name } });
  }

  async getPendingBets() {
    const sqlQuery = `
      SELECT *
      FROM (
        SELECT DISTINCT ON (e.external_id, b.market_id)
            e.external_id       AS "eventid",
            e.name           AS "eventname",
            CASE 
              WHEN LOWER(b.market_name) IN ('session', 'fancy', 'oddeven') THEN b.selection_id
              ELSE NULL
            END AS "selectionUid",
            b.market_name    AS "category",
            b.market_type    AS "marketType",
            b.market_id      AS "marketId",
            CASE
              WHEN LOWER(b.market_name) IN ('session', 'fancy', 'oddeven') THEN b.selection
              ELSE b.market_name
            END AS "marketName",
            b.placed_at      AS "placedAt"
        FROM bet b
        JOIN event e ON e.id = b.event_id
        WHERE
          (b.market_type = 'FANCY' OR b.market_type = 'PREMIUM' OR b.is_bookmaker = true
            OR b.market_name ILIKE 'Who will Win the Match?')
          AND((b.status = 'pending' AND NOT EXISTS (
            SELECT 1
            FROM result r
            WHERE r.event_id = b.event_id
            AND r.market_external_id = b.market_id
          )) OR b.status = 'rollback')
        ORDER BY
          e.external_id,
          b.market_id,
          b.placed_at DESC
      ) t
      ORDER BY t."placedAt" DESC;
    `;

    const fancyMarkets = await this.prisma.$queryRawUnsafe<
      {
        eventid: string | null;
        eventname: string | null;
        selectionUid: string | null;
        category: string | null;
        marketName: string | null;
        marketType: string | null;
        marketId: string | null;
        placedAt: string | null;
      }[]
    >(sqlQuery);

    const sportsRadarQuery = `
      SELECT *
      FROM (
        SELECT DISTINCT ON (e.external_id, b.market_id)
            e.external_id       AS "eventid",
            e.name           AS "eventname",
            CASE 
              WHEN LOWER(b.market_name) IN ('session', 'fancy', 'oddeven') THEN b.selection_id
              ELSE NULL
            END AS "selectionUid",
            b.market_name    AS "category",
            'PREMIUM'    AS "marketType",
            b.market_id      AS "marketId",
            CASE
              WHEN LOWER(b.market_name) IN ('session', 'fancy', 'oddeven') THEN b.selection
              ELSE b.market_name
            END AS "marketName",
            b.placed_at      AS "placedAt"
        FROM bet b
        JOIN event e ON e.id = b.event_id
        RIGHT JOIN providers p ON p.id = e.provider_id
        WHERE p.name ILIKE 'sportradar'
          AND b.market_type = 'NORMAL'
          AND((b.status = 'pending' AND NOT EXISTS (
            SELECT 1
            FROM result r
            WHERE r.event_id = b.event_id
            AND r.market_external_id = b.market_id
          )) OR b.status = 'rollback')
        ORDER BY
          e.external_id,
          b.market_id,
          b.placed_at DESC
      ) t
      ORDER BY t."placedAt" DESC;
    `;

    const sportRadarNormalMarkets = await this.prisma.$queryRawUnsafe<
      {
        eventid: string | null;
        eventname: string | null;
        selectionUid: string | null;
        category: string | null;
        marketName: string | null;
        marketType: string | null;
        marketId: string | null;
        placedAt: string | null;
      }[]
    >(sportsRadarQuery);

    return [...fancyMarkets, ...sportRadarNormalMarkets];
  }

  // async getUnsattleBetMarket(query: UnsettleBetMarketRequest) {
  //   const page = query.page && query.page > 0 ? query.page : 1;
  //   const limit = query.limit || 10;
  //   const skip = (page - 1) * limit;

  //   const sqlQuery = `
  //     SELECT *
  //     FROM (
  //       SELECT DISTINCT ON (b.event_id, b.market_id)
  //           b.event_id       AS "eventId",
  //           e.external_id       AS "eventExternalId",
  //           e.name           AS "eventName",
  //           b.market_id      AS "marketId",
  //           b.market_name    AS "marketName",
  //           b.market_category    AS "marketCategory",
  //           b.selection    AS "selection",
  //           b.market_type    AS "marketType",
  //           b.placed_at      AS "placedAt"
  //       FROM bet b
  //       JOIN event e ON e.id = b.event_id
  //       WHERE b.status = 'pending'
  //         AND NOT EXISTS (
  //           SELECT 1
  //           FROM result r
  //           WHERE r.event_id = b.event_id
  //             AND r.market_external_id = b.market_id
  //         )
  //         AND (
  //               $1::text IS NULL
  //               OR e.name ILIKE '%' || $1 || '%'
  //               OR b.market_name ILIKE '%' || $1 || '%'
  //             )
  //         AND ($2::timestamptz IS NULL OR b.placed_at >= $2)
  //         AND ($3::timestamptz IS NULL OR b.placed_at <= $3)
  //         AND ($4::bigint IS NULL OR e.id = $4::bigint)
  //       ORDER BY
  //         b.event_id,
  //         b.market_id,
  //         b.placed_at DESC
  //     ) t
  //     ORDER BY t."placedAt" DESC
  //     OFFSET $5 LIMIT $6;
  //   `;

  //   const markets = await this.prisma.$queryRawUnsafe<
  //     {
  //       eventId: number | null;
  //       eventExternalId: number | null;
  //       eventName: string | null;
  //       marketId: string | null;
  //       marketName: string | null;
  //       marketType: string | null;
  //       placedAt: string | null;
  //     }[]
  //   >(
  //     sqlQuery,
  //     query.search || null,
  //     query.fromDate || null,
  //     query.toDate || null,
  //     query.eventId || null,
  //     skip,
  //     limit,
  //   );

  //   const totalResult = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
  //     `
  //   SELECT COUNT(*)
  //   FROM (
  //       SELECT DISTINCT
  //           b.event_id,
  //           b.market_id
  //       FROM bet b
  //       JOIN event e ON e.id = b.event_id
  //       WHERE b.status = 'pending'
  //         AND NOT EXISTS (
  //           SELECT 1
  //           FROM result r
  //           WHERE r.event_id = b.event_id
  //             AND r.market_external_id = b.market_id
  //         )
  //         AND (
  //             $1::text IS NULL
  //             OR e.name ILIKE '%' || $1 || '%'
  //             OR b.market_name ILIKE '%' || $1 || '%'
  //           )
  //       AND ($2::timestamptz IS NULL OR b.placed_at >= $2)
  //       AND ($3::timestamptz IS NULL OR b.placed_at <= $3)
  //       AND ($4::bigint IS NULL OR e.id = $4::bigint)
  //   ) AS distinct_markets;
  //   `,
  //     query.search || null,
  //     query.fromDate || null,
  //     query.toDate || null,
  //     query.eventId || null,
  //   );

  //   const total = Number(totalResult[0].count);

  //   const pagination: Pagination = {
  //     currentPage: page,
  //     limit,
  //     totalItems: total,
  //     totalPage: Math.ceil(total / limit),
  //   };
  //   return { markets, pagination };
  // }

  async getUnsattleBetMarket(query: UnsettleBetMarketRequest) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const sport = query.sport ? query.sport.toLowerCase() : null;

    const sqlQuery = `
      SELECT *
      FROM (
        SELECT DISTINCT ON (b.event_id, b.market_id)
            b.event_id       AS "eventId",
            e.external_id       AS "eventExternalId",
            e.name           AS "eventName",
            b.market_id      AS "marketId",
            b.market_name    AS "marketName",
            b.market_category    AS "marketCategory",
            b.selection    AS "selection",
            b.market_type    AS "marketType",
            b.placed_at      AS "placedAt"
        FROM bet b
        JOIN event e ON e.id = b.event_id
        WHERE b.status = 'pending'
          AND NOT EXISTS (
            SELECT 1
            FROM result r
            WHERE r.event_id = b.event_id
              AND r.market_external_id = b.market_id
          )
          AND (
                $1::text IS NULL
                OR e.name ILIKE '%' || $1 || '%'
                OR b.market_name ILIKE '%' || $1 || '%'
                OR b.selection ILIKE '%' || $1 || '%'
              )
          AND ($2::timestamptz IS NULL OR b.placed_at >= $2)
          AND ($3::timestamptz IS NULL OR b.placed_at <= $3)
          AND ($4::bigint IS NULL OR e.id = $4::bigint)
          AND ($5::sport_type IS NULL OR b.sport = $5::sport_type)
        ORDER BY
          b.event_id,
          b.market_id,
          b.placed_at DESC
      ) t
      ORDER BY t."placedAt" DESC
      OFFSET $6 LIMIT $7;
    `;

    const markets = await this.prisma.$queryRawUnsafe<
      {
        eventId: number | null;
        eventExternalId: number | null;
        eventName: string | null;
        marketId: string | null;
        marketName: string | null;
        marketType: string | null;
        placedAt: string | null;
      }[]
    >(
      sqlQuery,
      query.search || null,
      query.fromDate || null,
      query.toDate || null,
      query.eventId || null,
      sport,
      skip,
      limit,
    );
    const totalResult = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
      `
    SELECT COUNT(*)
    FROM (
        SELECT DISTINCT
            b.event_id,
            b.market_id
        FROM bet b
        JOIN event e ON e.id = b.event_id
        WHERE b.status = 'pending'
          AND NOT EXISTS (
            SELECT 1
            FROM result r
            WHERE r.event_id = b.event_id
              AND r.market_external_id = b.market_id
          )
          AND (
              $1::text IS NULL
              OR e.name ILIKE '%' || $1 || '%'
              OR b.market_name ILIKE '%' || $1 || '%'
              OR b.selection ILIKE '%' || $1 || '%'
            )
        AND ($2::timestamptz IS NULL OR b.placed_at >= $2)
        AND ($3::timestamptz IS NULL OR b.placed_at <= $3)
        AND ($4::bigint IS NULL OR e.id = $4::bigint)
        AND ($5::sport_type IS NULL OR b.sport = $5::sport_type)
    ) AS distinct_markets;
    `,
      query.search || null,
      query.fromDate || null,
      query.toDate || null,
      query.eventId || null,
      sport,
    );

    const total = Number(totalResult[0].count);

    const pagination: Pagination = {
      currentPage: page,
      limit,
      totalItems: total,
      totalPage: Math.ceil(total / limit),
    };
    return { markets, pagination };
  }

  async handleMarketResult(result: WebhookMarketResult) {
    try {
      // const targetMarkets = [
      //   'match odds',
      //   'bookmaker',
      //   'mini bookmaker',
      //   'mini_bookmaker',
      //   'match_odds',
      //   'matchodds',
      //   '1x2',
      //   'winner (incl. super over)',
      // ];

      // Find event
      const events = await this.eventService.getEventsByExternalId(
        result.eventId,
      );

      if (!events || events.length === 0) {
        this.logger.warn(`Event not found: ${result.eventId}`);
        return;
      }

      const event = events[0];

      // Mark as closed
      if (
        targetMarkets.includes(result.market.toLowerCase()) &&
        events.some((e) => e.status !== StatusType.Closed)
      ) {
        // await this.prisma.event.updateMany({
        //   where: { externalId: result.eventId },
        //   data: {
        //     status: StatusType.Closed,
        //   },
        // });
        // // Clean Redis Keys
        // const marketKeys = `market:exists:${result.eventId}:*`;
        // await this.redisService.deleteKeysByPattern(marketKeys);
        await this.eventService.checkAndCloseEvent(result.eventId);
        this.logger.info(`Event ${result.eventId} marked as Closed`);
      }

      const market = await this.marketService.getByEventIdAndExternalId(
        event.id,
        result.marketId,
      );

      const existResult = await this.prisma.result.findFirst({
        where: {
          eventId: event.id,
          marketExternalId: result.marketId,
        },
      });
      if (
        !result.isRollback &&
        existResult &&
        existResult.status !== ResultStatusType.Rollbacked &&
        existResult.status !== ResultStatusType.RollbackPending
      )
        return; // Result Already Exist
      if (
        result.isRollback &&
        existResult &&
        existResult.status !== ResultStatusType.Proceed
      )
        return; // Result Not Procced or Rollbacked
      let selection: string | null = null;
      let isBetExist: boolean = false;
      const bet = await this.prisma.bet.findFirst({
        where: {
          eventId: { in: events.map((e) => e.id) },
          marketId: String(result.marketId),
          // selectionId: String(result.selectionId),
        },
      });
      if (bet) {
        selection = bet.selection;
        isBetExist = true;
      }

      let resultSelection: string | null = null;
      if (market) {
        const runners = market.runner as {
          runnerId?: string;
          selectionId?: string;
          runnerName: string;
        }[];
        this.logger.info(`Market Runners ${runners}`);
        if (Array.isArray(runners) && runners.length > 0) {
          const selectionObj = runners.find(
            (a) =>
              a?.runnerId == result.selectionId ||
              a?.selectionId == result.selectionId,
          );
          this.logger.info(`Result Selection Object ${selectionObj}`);
          if (selectionObj) {
            resultSelection = selectionObj.runnerName;
          }
        }
      }

      await this.prisma.result.upsert({
        where: {
          eventId_marketExternalId: {
            eventId: event.id,
            marketExternalId: result.marketId,
          },
        },
        update: {
          status: !isBetExist
            ? ResultStatusType.Proceed
            : result.isRollback && result.isRollback == 1
              ? ResultStatusType.RollbackPending
              : ResultStatusType.Pending,
          isRollbacked: result.isRollback == 1,
          selectionId: String(result.selectionId),
          result: String(result.result),
          outcome: JSON.parse(JSON.stringify(result)),
          resultSelection: resultSelection,
          rollbackedBy: result.isRollback == 1 ? ResultProvider.Webhook : null,
        },
        create: {
          eventId: event.id,
          marketId: market?.id,
          marketExternalId: result.marketId,
          selectionId: String(result.selectionId),
          result: String(result.result),
          outcome: JSON.parse(JSON.stringify(result)),
          status: isBetExist
            ? ResultStatusType.Pending
            : ResultStatusType.Proceed,
          selection: !market ? selection : null,
          resultSelection: resultSelection,
        },
      });

      if (market) {
        await this.marketService.changeMarketStatus(market.id, 'INACTIVE');
      }

      const redisKey = `market:exists:${event.externalId}:${result.marketId}`;
      await this.redisService.client.del(redisKey);

      await this.marketService.checkAndRemoveFancyFromRedis(
        event.externalId,
        result.marketId,
      );

      // this.utils.retryable(
      //   async () => {
      //     await this.betResolver(
      //       event.id,
      //       result.marketId,
      //       String(result.selectionId),
      //       result.result,
      //     );
      //   },
      //   { maxAttempts: 3 },
      // );

      this.logger.info(
        `Event ${result.eventId}, market ${result.marketId} result stored`,
      );
    } catch (error) {
      this.logger.error(`Error to store result: ${error.message}`);
    }
  }

  async manualResult(result: BetResultRequest) {
    // const targetMarkets = [
    //   'match odds',
    //   'bookmaker',
    //   'mini bookmaker',
    //   'mini_bookmaker',
    //   'match_odds',
    //   'matchodds',
    //   '1x2',
    //   'winner (incl. super over)',
    // ];

    // Find event
    const events = await this.eventService.getEventsByExternalId(
      result.eventId,
    );

    if (!events || events.length === 0) {
      this.logger.warn(`Event not found: ${result.eventId}`);
      throw new Error('Event not found');
    }

    const event = events[0];

    // Mark as closed
    if (
      targetMarkets.includes(result.market.toLowerCase()) &&
      event.status !== StatusType.Closed
    ) {
      // await this.prisma.event.updateMany({
      //   where: { externalId: event.externalId },
      //   data: {
      //     status: StatusType.Closed,
      //   },
      // });
      // // Clean Redis Keys
      // const marketKeys = `market:exists:${result.eventId}:*`;
      // await this.redisService.deleteKeysByPattern(marketKeys);
      await this.eventService.checkAndCloseEvent(event.externalId);
      this.logger.info(`Event ${result.eventId} marked as Closed`);
    }

    const market = await this.marketService.getByEventIdAndExternalId(
      event.id,
      result.marketId,
    );

    const existResult = await this.prisma.result.findFirst({
      where: {
        eventId: event.id,
        marketExternalId: result.marketId,
      },
    });
    if (
      existResult &&
      existResult.status !== ResultStatusType.RollbackPending &&
      existResult.status !== ResultStatusType.Rollbacked
    )
      throw new Error('Result already exists'); // Result Already Exist

    let selection: string | null = null;
    let isBetExist: boolean = false;
    const bet = await this.prisma.bet.findFirst({
      where: {
        eventId: BigInt(event.id),
        marketId: String(result.marketId),
      },
    });
    if (bet) {
      selection = bet.selection;
      isBetExist = true;
    }

    let resultSelection: string | null = null;
    if (market) {
      const runners = market.runner as {
        runnerId?: string;
        selectionId?: string;
        runnerName: string;
      }[];
      this.logger.info(`Market Runners ${runners}`);
      if (Array.isArray(runners) && runners.length > 0) {
        const selectionObj = runners.find(
          (a) =>
            a?.runnerId == result.selectionId ||
            a?.selectionId == result.selectionId,
        );
        this.logger.info(`Result Selection Object ${selectionObj}`);
        if (selectionObj) {
          resultSelection = selectionObj.runnerName;
        }
      }
    }

    await this.prisma.result.create({
      data: {
        eventId: event.id,
        marketId: market?.id,
        marketExternalId: result.marketId,
        selectionId: String(result.selectionId),
        result: String(result.result),
        outcome: JSON.parse(JSON.stringify(result)),
        providedBy: ResultProvider.Panel,
        status: isBetExist
          ? ResultStatusType.Pending
          : ResultStatusType.Proceed,
        selection: !market ? selection : null,
        resultSelection: resultSelection,
      },
    });

    if (market) {
      await this.marketService.changeMarketStatus(market.id, 'INACTIVE');
    }

    this.logger.info(
      `Event ${result.eventId}, market ${result.marketId} result stored`,
    );
    // } catch (error) {
    //   this.logger.error(`Error to store result: ${error.message}`);
    // }
  }

  async manualRollback(result: ManualRollbackRequest) {
    const event = await this.eventService.getByExternalId(result.eventId);

    if (!event) {
      this.logger.warn(`Event not found: ${result.eventId}`);
      throw new Error('Event not found');
    }

    const existResult = await this.prisma.result.findFirst({
      where: {
        eventId: event.id,
        marketExternalId: result.marketId,
      },
    });

    if (!existResult) throw new Error('Result not declared');
    if (existResult.status !== ResultStatusType.Proceed)
      throw new Error('Result not proceed');

    if (existResult.count >= 2) {
      throw new Error('You cannot rollback this result more than two times.');
    }

    await this.prisma.rolebackHistory.create({
      data: {
        resultId: existResult.id,
        selectionId: existResult.selectionId,
        result: existResult.result,
        isRollbacked: existResult.isRollbacked,
        status: existResult.status,
        outcome: JSON.parse(JSON.stringify(existResult.outcome)),
      },
    });

    const market = await this.marketService.getByEventIdAndExternalId(
      event.id,
      result.marketId,
    );

    let resultSelection: string | null = null;
    if (market) {
      const runners = market.runner as {
        runnerId?: string;
        selectionId?: string;
        runnerName: string;
      }[];
      this.logger.info(`Market Runners ${runners}`);
      if (Array.isArray(runners) && runners.length > 0) {
        const selectionObj = runners.find(
          (a) =>
            a?.runnerId == result.selectionId ||
            a?.selectionId == result.selectionId,
        );
        this.logger.info(`Result Selection Object ${selectionObj}`);
        if (selectionObj) {
          resultSelection = selectionObj.runnerName;
        }
      }
    }

    await this.prisma.result.update({
      where: { id: existResult.id },
      data: {
        status: ResultStatusType.RollbackPending,
        isRollbacked: true,
        selectionId: String(result.selectionId),
        result: String(result.result),
        resultSelection: resultSelection,
        rollbackedBy: ResultProvider.Panel,
        outcome: JSON.parse(JSON.stringify(result)),
        count: {
          increment: 1,
        },
      },
    });
  }

  async getByEventIdAndMarketExternalId(
    eventId: bigint | number,
    marketExternalId: string,
  ) {
    return await this.prisma.result.findFirst({
      where: {
        eventId,
        marketExternalId,
      },
    });
  }

  // async getSettleResult(query: settleBetMarketRequest) {
  //   const page = Math.max(Number(query.page) || 1, 1);
  //   const limit = Math.min(Number(query.limit) || 10, 100);
  //   const skip = (page - 1) * limit;

  //   const eventHasSettledBets: Prisma.EventWhereInput = {
  //     bets: {
  //       some: {
  //         settledAt: { not: null },
  //       },
  //     },
  //   };

  //   const where: Prisma.ResultWhereInput = {
  //     status: ResultStatusType.Proceed,

  //     event: {
  //       ...eventHasSettledBets,
  //     },
  //   };

  //   if (query.eventId) {
  //     where.event = {
  //       ...eventHasSettledBets,
  //       id: BigInt(query.eventId),
  //     };
  //   }

  //   if (query.search?.trim()) {
  //     const search = query.search.trim();

  //     where.OR = [
  //       {
  //         event: {
  //           ...eventHasSettledBets,
  //           name: {
  //             contains: search,
  //             mode: 'insensitive',
  //           },
  //         },
  //       },
  //       {
  //         market: {
  //           name: {
  //             contains: search,
  //             mode: 'insensitive',
  //           },
  //         },
  //         event: {
  //           ...eventHasSettledBets,
  //         },
  //       },
  //     ];
  //   }

  //   if (query.fromDate || query.toDate) {
  //     where.createdAt = {
  //       gte: query.fromDate,
  //       lte: query.toDate,
  //     };
  //   }

  //   const [results, totalItems] = await this.prisma.$transaction([
  //     this.prisma.result.findMany({
  //       where,
  //       include: {
  //         event: {
  //           select: {
  //             id: true,
  //             name: true,
  //             sport: true,
  //           },
  //         },
  //         market: {
  //           select: {
  //             id: true,
  //             externalId: true,
  //             name: true,
  //             runner: true,
  //             type: true,
  //           },
  //         },
  //       },
  //       orderBy: {
  //         settledAt: 'desc',
  //       },
  //       skip,
  //       take: limit,
  //     }),

  //     this.prisma.result.count({ where }),
  //   ]);

  //   return {
  //     markets: results,
  //     pagination: {
  //       currentPage: page,
  //       limit,
  //       totalItems,
  //       totalPage: Math.ceil(totalItems / limit),
  //     },
  //   };
  // }

  async getSettleResult(query: settleBetMarketRequest) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Number(query.limit) || 10, 100);
    const skip = (page - 1) * limit;
    const eventFilter: Prisma.EventWhereInput = {
      bets: {
        some: {
          settledAt: { not: null },
        },
      },
    };
    if (query.sport) {
      eventFilter.bets = {
        some: {
          settledAt: { not: null },
          sport: query.sport,
        },
      };
    }
    if (query.eventId) {
      eventFilter.id = BigInt(query.eventId);
    }
    const where: Prisma.ResultWhereInput = {
      status: ResultStatusType.Proceed,
      event: eventFilter,
      count: {
        lt: 2,
      },
    };

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          event: {
            ...eventFilter,
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          market: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
          event: eventFilter,
        },
        {
          selection: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {
        gte: query.fromDate,
        lte: query.toDate,
      };
    }

    const [resurawResultslts] = await this.prisma.$transaction([
      this.prisma.result.findMany({
        where: {
          ...where,
          settledAt: { not: null },
        },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              sport: true,
              bets: true,
            },
          },
          market: {
            select: {
              id: true,
              externalId: true,
              name: true,
              runner: true,
              type: true,
            },
          },
        },
        orderBy: {
          settledAt: 'desc',
        },
      }),

      // this.prisma.result.count({ where }),
    ]);
    const filtered = resurawResultslts.filter((r) =>
      r.event?.bets?.some((b) => b.marketId === r.marketExternalId),
    );

    const results = filtered.slice(skip, skip + limit);
    return {
      markets: results,
      pagination: {
        currentPage: page,
        limit,
        totalItems: filtered.length,
        totalPage: Math.ceil(filtered.length / limit),
      },
    };

    //   return {
    //     markets: results,
    //     pagination: {
    //       currentPage: page,
    //       limit,
    //       totalItems,
    //       totalPage: Math.ceil(totalItems / limit),
    //     },
    //   };
    // }
  }

  async createUserForResultPanel(paylad: CreateUserForResultPanelRequest) {
    const user = await this.usersService.create({
      firstname: paylad.firstname || '',
      lastname: paylad.lastname || '',
      mobile: paylad.mobile,
      username: paylad.username,
      email: paylad.email,
      password: paylad.password,
      userRoll: 'RESULT MANAGER',
    });
    return user;
  }
}
