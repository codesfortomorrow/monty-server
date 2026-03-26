/* eslint-disable @typescript-eslint/no-unused-vars */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  Bet,
  // BetStatusType,
  BetType,
  Prisma,
  SportType,
  StatusType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  GetBookSetCalcDto,
  GetMarketBookSetCalcDto,
  GetSessionPLDto,
  UserWiseBreakDownRequest,
} from './dto';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { ExtraMarket } from 'src/market-mapper/market.type';
import { BaseService, Pagination, UserType } from '@Common';
import { MarketService } from 'src/market/market.service';
import { sportConfigFactory } from '@Config';
import { ConfigType } from '@nestjs/config';
import { getSportId } from 'src/utils/sports';
import { ReportType } from 'src/reports/dto';
import { UsersService } from 'src/users';
import { json } from 'body-parser';

@Injectable()
export class ExposureService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly marketService: MarketService,
    @Inject(forwardRef(() => UsersService))
    private readonly userService: UsersService,
    @Inject(sportConfigFactory.KEY)
    private readonly sportConfig: ConfigType<typeof sportConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: ExposureService.name } });
  }
  refreshExposureByUserId = async (
    userId: bigint,
    tx: Prisma.TransactionClient,
  ): Promise<number> => {
    try {
      // 1️⃣ Fetch exposures for normal markets (non-session/fancy)
      const normalExposures = await tx.exposure.groupBy({
        by: ['sportId', 'marketExternalId'], // Prisma requires a full grouping key (no event_id column here)
        where: {
          status: StatusType.Active,
          userId,
          amount: { lt: new Decimal(0) },
        },
        _min: {
          amount: true,
        },
      });

      // 3️⃣ Combine and sum all negative exposures
      const totalExposure = [
        ...normalExposures.map((e) => e._min?.amount || new Decimal(0)),
      ].reduce((acc, val) => acc.plus(val), new Decimal(0));

      return totalExposure.toNumber();
    } catch (error) {
      console.error('❌ Error refreshing exposure:', error);
      throw new Error('Failed to refresh exposure.');
    }
  };

  async calculateFancyExposure(
    bets: Bet[],
    marketName: string,
    selectionId: string,
    commission: number = 0,
  ): Promise<Record<string, number>> {
    const total: Record<string, number> = {
      [selectionId]: 0,
    };

    if (marketName !== 'session') {
      const profitOrLossResults = bets.reduce(
        (acc, bet) => {
          const price = parseFloat(bet.odds.toString());
          const stake = parseFloat(bet.amount.toString());

          if (bet.betOn === BetType.Lay) {
            acc.profitLay += stake;
            acc.lossLay += parseFloat((-(price - 1.0) * stake).toFixed(2));
          } else if (bet.betOn === BetType.Back) {
            acc.profitBack += parseFloat(((price - 1.0) * stake).toFixed(2));
            acc.lossBack += -stake;
          }

          return acc;
        },
        { profitBack: 0, lossBack: 0, profitLay: 0, lossLay: 0 },
      );

      const totalBackLoss =
        profitOrLossResults.lossBack + profitOrLossResults.profitLay;
      const totalLayLoss =
        profitOrLossResults.lossLay + profitOrLossResults.profitBack;

      const maxLoss = Math.min(totalBackLoss, totalLayLoss);
      total[selectionId] = maxLoss;
      if (commission > 0) {
        const commissionAdjusted = maxLoss - maxLoss * commission;

        total[selectionId] = parseFloat(commissionAdjusted.toFixed(2));
      }
      //    // console.log(maxLoss,'maxLoss',commission,totalAmounts);
    } else {
      const prices = bets.map((bet) => parseFloat(bet.odds.toString()));
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      let maxLoss = Infinity;
      const profitLossResults: { position: number; profit_or_loss: number }[] =
        [];

      for (
        let positionValue = minPrice - 1;
        positionValue <= maxPrice + 1;
        positionValue++
      ) {
        let totalProfitOrLoss = 0;

        const profitOrLossPromises = bets.map(async (bet) => {
          const price = parseFloat(bet.odds.toString());
          const stake = parseFloat(bet.amount.toString());
          const percent = bet.percentage
            ? parseFloat(bet.percentage.toString())
            : 0;
          let profitOrLoss = 0;

          if (bet.betOn === BetType.Lay) {
            profitOrLoss =
              price <= positionValue ? -(stake * (percent / 100)) : stake;
          } else if (bet.betOn === BetType.Back) {
            profitOrLoss =
              price <= positionValue ? stake * (percent / 100) : -stake;
          }

          return profitOrLoss;
        });

        const profitLossValues = await Promise.all(profitOrLossPromises);
        totalProfitOrLoss = profitLossValues.reduce((acc, val) => acc + val, 0);

        profitLossResults.push({
          position: positionValue,
          profit_or_loss: totalProfitOrLoss,
        });

        maxLoss = Math.min(maxLoss, totalProfitOrLoss);
        total[selectionId] = maxLoss;
      }
      if (commission > 0) {
        const commissionAdjusted = maxLoss - maxLoss * commission;

        total[selectionId] = parseFloat(commissionAdjusted.toFixed(2));
      }
    }

    return total;
  }

  async calculatePremiumExposure(
    bets: Bet[],
    eventExternalId: string,
    marketExternalId: string,
    commission: number = 0,
  ): Promise<Record<string, number>> {
    const redisKey = `extra:${eventExternalId}`;
    const redisData = await this.redis.client.get(redisKey);
    if (!redisData) throw new Error('Invalid premium bet');
    try {
      const premiumMarket = JSON.parse(redisData) as { data: ExtraMarket[] };

      if (!premiumMarket?.data || !Array.isArray(premiumMarket?.data))
        throw new Error('Invalid premium bet bet');
      const market = premiumMarket.data.find(
        (premium) => premium.marketId === marketExternalId,
      );

      if (!market?.runners) throw new Error('Invalid premium market');

      const runners = market.runners as { runnerId: string }[];

      const total: Record<string, number> = {};
      for (const r of runners) {
        total[r.runnerId] = 0;
      }

      for (const b of bets) {
        const sel = b.selectionId;
        const price = Number(b.odds);
        const stake = Number(b.amount);

        if (b.betOn === BetType.Back) {
          total[sel] += (price - 1) * stake;
          for (const r of runners) {
            if (r.runnerId !== sel) {
              total[r.runnerId] -= stake;
            }
          }
        }
      }

      if (commission > 0) {
        for (const s in total) {
          total[s] = Number((total[s] + total[s] * commission).toFixed(2));
        }
      }
      return total;
    } catch {
      this.logger.warn(`Error to perse Premium market during bet place`);
      throw new Error('Invalid premium bet');
    }
  }

  async calculateNormalExposure(
    bets: Bet[],
    eventId: bigint,
    marketExternalId: string,
    isBookmaker: boolean,
    commission: number = 0,
  ): Promise<Record<string, number>> {
    const market = await this.marketService.getByEventIdAndExternalId(
      eventId,
      marketExternalId,
    );

    if (!market || !market.runner) {
      throw new Error(
        `Market runners not found for marketId: ${marketExternalId}`,
      );
    }

    const runners = market.runner as { selectionId: string }[];

    const total: Record<string, number> = {};
    for (const r of runners) {
      total[r.selectionId] = 0;
    }

    for (const b of bets) {
      const sel = b.selectionId;
      const price = Number(b.odds);
      const stake = Number(b.amount);

      if (isBookmaker) {
        if (b.betOn === BetType.Back) {
          total[sel] += price * 0.01 * stake;
          for (const r of runners) {
            if (r.selectionId !== sel) {
              total[r.selectionId] -= stake;
            }
          }
        }

        if (b.betOn === BetType.Lay) {
          total[sel] -= price * 0.01 * stake;
          for (const r of runners) {
            if (r.selectionId !== sel) {
              total[r.selectionId] += stake;
            }
          }
        }
      } else {
        if (b.betOn === BetType.Back) {
          total[sel] += (price - 1) * stake;
          for (const r of runners) {
            if (r.selectionId !== sel) {
              total[r.selectionId] -= stake;
            }
          }
        }

        if (b.betOn === BetType.Lay) {
          total[sel] -= (price - 1) * stake;
          for (const r of runners) {
            if (r.selectionId !== sel) {
              total[r.selectionId] += stake;
            }
          }
        }
      }
    }

    if (commission > 0) {
      for (const s in total) {
        total[s] = Number((total[s] + total[s] * commission).toFixed(2));
      }
    }

    return total;
  }

  async getBookSetCalc(dto: GetBookSetCalcDto, userId: bigint) {
    const { eventId } = dto;

    try {
      const result: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT
          market_id,
          market_external_id,
          selection_id,
          SUM(amount) AS exposure_amount
        FROM exposure
        WHERE user_id = ${userId}
          AND event_id = ${eventId}
        GROUP BY market_id, market_external_id, selection_id
        ORDER BY market_id ASC;
      `);
      // Grouping market-wise
      const grouped = result.reduce((acc, row) => {
        if (!acc[row.market_external_id]) {
          acc[row.market_external_id] = {
            marketId: row.market_id,
            marketExternalId: row.market_external_id,
            selections: [],
          };
        }

        acc[row.market_external_id].selections.push({
          selectionId: row.selection_id,
          exposure: Number(row.exposure_amount),
        });

        return acc;
      }, {});

      return Object.values(grouped);
    } catch (error) {
      console.error('❌ Exposure fetch error:', error);
      throw new Error(
        'Something went wrong while calculating book set exposure',
      );
    }
  }

  async getSessionPLByUser(
    dto: GetSessionPLDto,
    userId: bigint,
    path: string,
    type: string,
  ) {
    const { eventId, selectionId } = dto;
    console.log(path, 'path');

    const bets = await this.prisma.$queryRaw<any[]>`
  SELECT
      b.id,
      b.user_id,
      b.event_id,
      b.market_id,
      b.market_name,
      b.market_type,
      b.selection_id,
      b.selection,
      b.amount,
      b.odds,
      b.percentage,
      b.bet_on as "betOn"
  FROM bet b
  JOIN "user" u ON u.id = b.user_id
  JOIN user_meta um ON um.user_id = u.id
  WHERE
      um.upline <@ (${path})::ltree
      AND b.event_id = ${BigInt(eventId)}
      AND b.selection_id = ${selectionId}
      AND b.status = 'pending'::bet_status_type
`;

    // AND b.market_type = 'Fancy'
    if (!bets.length) return 'No bets found';
    console.log(bets, 'bets');
    // Extract min/max price range
    const prices = bets.map((b) => Number(b.odds));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const results = [];

    for (let position = minPrice - 5; position <= maxPrice + 5; position++) {
      let totalPL = 0;

      for (const bet of bets) {
        const price = Number(bet.odds);
        const stake = Number(bet.amount);
        const percent = Number(bet.percentage ?? 0);
        // const comm = Number(100) / 100;

        let pl = 0;

        if (bet.betOn === 'lay') {
          if (price <= position) {
            // Lay lose
            pl = -(stake * (percent / 100));
          } else {
            // Lay win
            pl = stake;
          }
        } else if (bet.betOn === 'back') {
          if (price <= position) {
            // Back win
            pl = stake * (percent / 100);
          } else {
            // Back lose
            pl = -stake;
          }
        }
        totalPL += pl;
      }

      results.push({
        position,
        profit_or_loss: totalPL,
      });
    }

    return results;
  }
  async getUserwithTopExposure(uplinePath: string) {
    console.log(uplinePath, 'uplinePath');
    return this.prisma.$queryRaw<
      { id: number; username: string; total_exposure: string }[]
    >`
    SELECT 
        u.id,
        u.username,
        SUM(
          CASE 
            WHEN w.exposure_amount < 0 THEN w.exposure_amount 
            ELSE 0 
          END
        )::decimal(16,2) AS total_exposure
    FROM "user" u
    JOIN "user_meta" um ON um.user_id = u.id
    JOIN "wallets" w ON w.user_id = u.id
    JOIN role r ON r.id = u.role_id
    WHERE um.upline <@ text2ltree(${uplinePath})
      AND w.type IN ('main', 'bonus')
      AND r.name = 'USER'
    GROUP BY u.id, u.username
    ORDER BY total_exposure ASC   -- more negative first
    LIMIT 10;
  `;
  }

  async getAllUsersBooksetBySport(
    uplineId: bigint,
    userType: UserType,
    path: string,
    sport: SportType,
  ) {
    const sportId = getSportId(this.sportConfig.sports, sport);
    const isAdmin = userType === UserType.Admin;

    const uplineCondition = isAdmin
      ? Prisma.sql`ue.user_type = 'OWNER'`
      : Prisma.sql`ue.upline_id = ${BigInt(uplineId)}`;

    const result = await this.prisma.$queryRaw<
      {
        event_id: bigint;
        event_name: string;
        market_id: bigint | null;
        market_external_id: string;
        market_type: string | null;
        market_name: string | null;
        selection_id: string;
        selection_name: string | null;
        sort_priority: number | string | null;
        exposure_amount: string;
        upline_pl: string;
        last_placed_at: Date | null;
      }[]
    >`
WITH base AS (
  SELECT
    ev.id AS event_id,
    ev.name AS event_name,

    m.id AS market_id,
    e.market_external_id,

    MAX(
      CASE
        WHEN m.id IS NOT NULL THEN UPPER(m.type::text)
        ELSE 'FANCY'
      END
    ) AS market_type,

    MAX(b.market_name) AS fancy_market_name,
    MAX(b.selection) AS fancy_selection_name,
    MAX(b.last_placed_at) AS last_placed_at,

    e.selection_id,
    r.runner_name,
    r.sort_priority,

    -- ✅ TOTAL EXPOSURE FOR VIEW
    SUM(ue.total_pl)::decimal(16,2) AS exposure_amount,

    -- ✅ ACTUAL SHARE
    SUM(ue.upline_pl)::decimal(16,2) AS upline_pl

  FROM upline_exposure ue
  JOIN exposure e ON e.id = ue.exposure_id
  JOIN user_meta um ON um.user_id = e.user_id
  JOIN "user" u ON u.id = e.user_id
  JOIN role rl ON rl.id = u.role_id
  JOIN event ev ON ev.id = e.event_id

  LEFT JOIN market m
    ON m.external_id = e.market_external_id
   AND m.event_id = e.event_id

  LEFT JOIN (
    SELECT
      event_id,
      selection_id,
      market_id,
      MAX(selection) AS selection,
      MAX(market_name) AS market_name,
      MAX(placed_at) AS last_placed_at
    FROM bet
    GROUP BY event_id, market_id, selection_id
  ) b
    ON b.event_id = e.event_id
   AND b.selection_id = e.selection_id
   AND e.market_external_id = b.market_id

  LEFT JOIN LATERAL (
      SELECT 
        runner_elem->>'runnerName' AS runner_name,
        runner_elem->>'sortPriority' AS sort_priority
      FROM jsonb_array_elements(m.runner::jsonb) AS runner_elem
      WHERE runner_elem->>'selectionId' = e.selection_id
      LIMIT 1
  ) r ON true

  WHERE  e.sport_id = ${sportId}
    AND e.status::text = 'active'
    AND rl.name != 'DEMO'
    AND ${uplineCondition}

  GROUP BY
      ev.id,
      ev.name,
      m.id,
      e.market_external_id,
      e.selection_id,
      r.runner_name,
      r.sort_priority
)

SELECT
  event_id,
  event_name,
  market_id,
  market_external_id,
  market_type,
  last_placed_at,
  CASE
    WHEN market_type = 'FANCY' THEN fancy_market_name
    ELSE fancy_market_name
  END AS market_name,

  selection_id,

  CASE
    WHEN market_type = 'FANCY' THEN fancy_selection_name
    ELSE  runner_name
  END AS selection_name,

  exposure_amount,
  sort_priority,
  upline_pl

FROM base
ORDER BY last_placed_at DESC;
`;

    const grouped = result.reduce(
      (acc, row) => {
        const key = row.market_external_id;

        if (!acc[key]) {
          acc[key] = {
            marketId: row.market_id ? Number(row.market_id) : null,
            marketExternalId: row.market_external_id,
            marketType: row.market_type,
            marketName: row.market_name,
            eventId: Number(row.event_id),
            eventName: row.event_name,
            lastPlacedAt: row.last_placed_at,
            selections: [],
          };
        }
        if (!acc[key].marketType && row.market_type) {
          acc[key].marketType = row.market_type;
        }
        if (!acc[key].marketName && row.market_name) {
          acc[key].marketName = row.market_name;
        }
        if (!acc[key].lastPlacedAt && row.last_placed_at) {
          acc[key].lastPlacedAt = row.last_placed_at;
        }

        acc[key].selections.push({
          selectionId: row.selection_id,
          selectionName: row.selection_name ?? row.selection_id,
          sortPriority: row.sort_priority ?? 0,
          exposure: Number(row.exposure_amount),
          uplinePl: Number(row.upline_pl),
        });

        return acc;
      },
      {} as Record<string, any>,
    );

    return Object.values(grouped).sort((a, b) => {
      if (a.lastPlacedAt && b.lastPlacedAt) {
        return b.lastPlacedAt.getTime() - a.lastPlacedAt.getTime();
      }
      if (a.lastPlacedAt) return -1;
      if (b.lastPlacedAt) return 1;
      return 0;
    });
  }

  async getMarketBookSetCalc(
    dto: GetMarketBookSetCalcDto,
    path: string,
    uplineId: bigint,
    userType: UserType,
  ) {
    const { eventId, marketExtenralId } = dto;
    const isAdmin = userType === UserType.Admin;
    const uplineCondition = isAdmin
      ? Prisma.sql`ue.user_type = 'OWNER'`
      : Prisma.sql`ue.upline_id = ${BigInt(uplineId)}`;

    try {
      const result = await this.prisma.$queryRaw<
        {
          market_id: bigint | null;
          market_external_id: string;
          market_type: string | null;
          selection_id: string;
          selection_name: string | null;
          exposure_amount: string; // TOTAL PL
          upline_pl: string; // 🆕 UPLINE PL
        }[]
      >`
SELECT
    m.id AS market_id,
    e.market_external_id,
    m.type::text AS market_type,
    e.selection_id,

    -- ✅ CONDITIONAL SELECTION NAME
    MAX(
      CASE
        WHEN b.market_type::text IN ('FANCY', 'Session')
          THEN b.selection
        ELSE r.runner_name
      END
    ) AS selection_name,

    -- ✅ TOTAL PL (OLD BEHAVIOUR)
    SUM(ue.total_pl)::decimal(16,2) AS exposure_amount,

    -- 🆕 UPLINE % PL
    SUM(
      CASE
        WHEN ${path} = '0' THEN ue.upline_pl
        ELSE ue.upline_pl
      END
    )::decimal(16,2) AS upline_pl

FROM upline_exposure ue
JOIN exposure e ON e.id = ue.exposure_id

JOIN user_meta um 
    ON um.user_id = e.user_id

-- ✅ MARKET JOIN
LEFT JOIN market m
    ON m.external_id = e.market_external_id
   AND m.event_id = e.event_id

-- ✅ BET (sirf fancy/session ke liye)
LEFT JOIN (
    SELECT
      event_id,
      selection_id,
      MAX(selection) AS selection,
      MAX(market_name) AS market_name,
      MAX(market_type) AS market_type,
      MAX(placed_at) AS last_placed_at
    FROM bet
    GROUP BY event_id, selection_id
) b
  ON b.event_id = e.event_id
 AND b.selection_id = e.selection_id

-- ✅ RUNNER JSON (normal markets)
LEFT JOIN LATERAL (
    SELECT runner_elem->>'runnerName' AS runner_name
    FROM jsonb_array_elements(m.runner::jsonb) AS runner_elem
    WHERE runner_elem->>'selectionId' = e.selection_id
    LIMIT 1
) r ON true

WHERE ${uplineCondition} 
    AND e.event_id = ${eventId}
    AND e.market_external_id = ${marketExtenralId}
    AND e.status::text = 'active'

GROUP BY
    m.id,
    e.market_external_id,
    m.type,
    e.selection_id

ORDER BY e.market_external_id;
`;
      console.log(result, 'result');
      const grouped = result.reduce(
        (acc, row) => {
          if (!acc[row.market_external_id]) {
            acc[row.market_external_id] = {
              marketId: row.market_id ? Number(row.market_id) : null,
              marketExternalId: row.market_external_id,
              marketType: row.market_type,
              selections: [],
            };
          }

          acc[row.market_external_id].selections.push({
            selectionId: row.selection_id,
            selectionName: row.selection_name ?? row.selection_id,
            exposure: Number(row.exposure_amount), // TOTAL PL
            uplinePl: Number(row.upline_pl), // 🆕 UPLINE PL
          });

          return acc;
        },
        {} as Record<string, any>,
      );

      return Object.values(grouped);
    } catch (error) {
      console.error('❌ Exposure fetch error:', error);
      throw new Error(
        'Something went wrong while calculating book set exposure',
      );
    }
  }

  // async GetDownlineWiseBreakdown(
  //   query: UserWiseBreakDownRequest,
  //   uplineId: bigint,
  //   userType: UserType,
  // ) {
  //   const page = query.page && Number(query.page) > 0 ? Number(query.page) : 1;
  //   const limit = Number(query.limit ?? 10);
  //   const skip = (page - 1) * limit;

  //   // const isAdmin = userType === UserType.Admin;
  //   console.log(query, 'uplineId', uplineId, userType);
  //   // const uplineCondition = isAdmin
  //   //   ? Prisma.sql`ue.user_type = 'OWNER'`
  //   //   : Prisma.sql`ue.upline_id = ${BigInt(uplineId)}`;

  //   // 🔹 1. Resolve upline path
  //   let uplinePath: string | null = '0';

  //   if (query.userId) {
  //     uplinePath = await this.userService.getUplinePathById(query.userId);
  //   } else if (userType === UserType.User) {
  //     uplinePath = await this.userService.getUplinePathById(uplineId);
  //   }
  //   console.log(uplinePath, 'uplinePath');

  //   if (!uplinePath) throw new Error('User not found');

  //   // 🔹 2. Resolve role
  //   let userRole = 'OWNER';

  //   if (query.userId) {
  //     const role = await this.userService.getRoleByUserId(query.userId);
  //     if (role) userRole = role.name;
  //   } else if (userType === UserType.User) {
  //     const role = await this.userService.getRoleByUserId(uplineId);
  //     console.log(role, 'role');
  //     if (role) userRole = role.name;
  //   }
  //   console.log(userRole, 'userRole');

  //   // 🔹 3. Report depth condition (Prisma.sql ONLY)
  //   // let reportDepthQuery = Prisma.sql``;

  //   // if (userRole === 'MASTER') {
  //   //   reportDepthQuery = Prisma.sql`
  //   //   AND nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
  //   // `;
  //   // } else if (query.reportType === ReportType.DIRECT) {
  //   //   reportDepthQuery = Prisma.sql`
  //   //   AND (
  //   //     nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
  //   //     OR EXISTS (
  //   //       SELECT 1
  //   //       FROM user_meta pum
  //   //       JOIN "user" pu ON pu.id = pum.user_id
  //   //       JOIN role pr ON pr.id = pu.role_id
  //   //       WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
  //   //         AND pr.name = 'USER'
  //   //     )
  //   //   )
  //   // `;
  //   // } else {
  //   //   reportDepthQuery = Prisma.sql`
  //   //   AND NOT (
  //   //     nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
  //   //     OR EXISTS (
  //   //       SELECT 1
  //   //       FROM user_meta pum
  //   //       JOIN "user" pu ON pu.id = pum.user_id
  //   //       JOIN role pr ON pr.id = pu.role_id
  //   //       WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
  //   //         AND pr.name = 'USER'
  //   //     )
  //   //   )
  //   // `;
  //   // }

  //   // 🔹 4. MAIN QUERY (SAFE)
  //   const baseQuery = `
  //   SELECT
  //       um.upline::text AS "directPath",
  //       u.username,
  //       u.id AS "userId",
  //       r.name AS "role",
  //       e.selection_id AS "selectionId",

  //       SUM(ue.total_pl)::decimal(15,2) AS "totalExposure",

  //       SUM(ue.upline_pl)::decimal(15,2) AS "uplinePl",
  //       MAX(ue.updated_at) AS "lastUpdatedAT"

  //     FROM upline_exposure ue
  //     JOIN exposure e ON e.id = ue.exposure_id
  //     JOIN "user" u ON u.id = ue.upline_id
  //     JOIN user_meta um ON um.user_id = u.id
  //     JOIN role r ON r.id = u.role_id

  //     LEFT JOIN market m
  //       ON m.external_id = e.market_external_id
  //       AND m.event_id = e.event_id

  //     WHERE um.upline <@ text2ltree($1::text)
  //       AND r.name != 'DEMO'
  //       AND ($2::bigint IS NULL OR e.event_id = $2::bigint)
  //       AND ($3::text IS NULL OR e.market_external_id = $3::text)
  //       AND e.status::text = 'active'
  //       AND ($4::text IS NULL OR u.username ILIKE '%' || $4::text || '%')

  //     GROUP BY
  //       um.upline,
  //       u.username,
  //       u.id,
  //       r.name,
  //       e.selection_id

  //     ORDER BY "lastUpdatedAT"
  // `;

  //   const sqlQuery = `
  //     WITH base AS (${baseQuery})
  //     SELECT
  //       b."directPath" AS "directPath",
  //       b.username,
  //       b."userId",
  //       b.role,
  //       (
  //         CASE
  //           WHEN b.role = 'USER' THEN MIN(b."totalExposure") * -1
  //           ELSE MIN(b."totalExposure")
  //         END
  //       ) AS "totalExposure",
  //       (
  //         CASE
  //           WHEN b.role = 'USER' THEN MIN(b."uplinePl") * -1
  //           ELSE MIN(b."uplinePl")
  //         END
  //       ) AS "uplinePl"
  //     FROM base b
  //     GROUP BY
  //       b."directPath",
  //       b.username,
  //       b."userId",
  //       b.role
  //     OFFSET $5::bigint LIMIT $6::bigint
  //   `;

  //   const countQuery = `
  //       WITH base AS (${baseQuery})
  //       SELECT
  //         COUNT(DISTINCT(b."userId")) AS "count"
  //       FROM base b
  //   `;

  //   // 🔹 5. Build uplines
  //   // const uplineIds = uplinePath.split('.');
  //   // uplineIds.shift();

  //   // const uplineData: any[] = [
  //   //   { id: '', path: '0', username: '', role: 'OWNER' },
  //   // ];

  //   // for (const uid of uplineIds) {
  //   //   const res = await this.prisma.$queryRaw<any[]>(Prisma.sql`
  //   //   SELECT
  //   //     u.id,
  //   //     u.username,
  //   //     um.upline::text AS path,
  //   //     r.name AS role
  //   //   FROM "user" u
  //   //   JOIN user_meta um ON um.user_id = u.id
  //   //   JOIN role r ON r.id = u.role_id
  //   //   WHERE u.id = ${BigInt(uid)}
  //   //     AND r.name != 'DEMO'
  //   // `);

  //   //   if (res.length) {
  //   //     uplineData.push({
  //   //       id: res[0].id.toString(),
  //   //       username: res[0].username,
  //   //       uplinePath: res[0].path,
  //   //       role: res[0].role,
  //   //     });
  //   //   }
  //   // }

  //   // 🔹 6. DIRECT / MASTER
  //   // if (userRole === 'MASTER' || query.reportType === ReportType.DIRECT) {

  //   const params = [
  //     uplinePath,
  //     query.eventId || null,
  //     query.marketExtenralId || null,
  //     query.search || null,
  //     skip,
  //     limit,
  //   ];
  //   const countParams = [
  //     uplinePath,
  //     query.eventId || null,
  //     query.marketExtenralId || null,
  //     query.search || null,
  //   ];
  //   const [rows, count] = await Promise.all([
  //     this.prisma.$queryRawUnsafe<
  //       {
  //         directPath: string | null;
  //         username: string | null;
  //         userId: bigint | number | string | null;
  //         role: string | null;
  //         totalExposure: number | null;
  //         uplinePl: number | null;
  //       }[]
  //     >(sqlQuery, ...params),
  //     this.prisma.$queryRawUnsafe<
  //       {
  //         count: bigint | number | null;
  //       }[]
  //     >(countQuery, ...countParams),
  //   ]);

  //   const total = Number(count?.[0]?.count || 0);
  //   const pagination: Pagination = {
  //     currentPage: page,
  //     limit,
  //     totalItems: total,
  //     totalPage: Math.ceil(total / limit),
  //   };
  //   return { rows, pagination };
  //   // }

  //   // 🔹 7. HIERARCHY
  //   //   const downlines = await this.prisma.$queryRaw<any[]>(Prisma.sql`
  //   //   SELECT
  //   //     u.id AS "userId",
  //   //     u.username,
  //   //     um.upline::text AS "directPath",
  //   //     r.name AS role
  //   //   FROM "user" u
  //   //   JOIN user_meta um ON um.user_id = u.id
  //   //   JOIN role r ON r.id = u.role_id
  //   //   WHERE um.upline <@ text2ltree(${uplinePath})
  //   //     AND nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
  //   //     AND r.name != 'DEMO'
  //   // `);

  //   //   for (const user of downlines) {
  //   //     const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
  //   //   WITH base AS (${baseQuery})
  //   //   SELECT
  //   //     "selectionId",
  //   //     "selectionName",
  //   //     SUM("totalExposure")::decimal(16,2) AS "totalExposure",
  //   //     SUM("uplinePl")::decimal(16,2) AS "uplinePl"
  //   //   FROM base
  //   //   WHERE text2ltree("directPath") <@ text2ltree(${user.directPath})
  //   //   GROUP BY "selectionId", "selectionName"
  //   // `);

  //   //     user.selections = rows.map((r) => ({
  //   //       selectionId: r.selectionId,
  //   //       selectionName: r.selectionName ?? r.selectionId,
  //   //       exposure: Number(r.totalExposure),
  //   //       uplinePl: Number(r.uplinePl),
  //   //     }));
  //   //   }

  //   //   return {
  //   //     data: downlines.filter((d) => d.selections?.length),
  //   //     uplines: uplineData,
  //   //   };
  // }

  async GetDownlineWiseBreakdown(
    query: UserWiseBreakDownRequest,
    uplineId: bigint,
    userType: UserType,
  ) {
    const isAdmin = userType === UserType.Admin;
    console.log(query, 'uplineId', uplineId, userType);
    const uplineCondition = isAdmin
      ? Prisma.sql`ue.user_type = 'OWNER'`
      : Prisma.sql`ue.upline_id = ${BigInt(uplineId)}`;

    // 🔹 1. Resolve upline path
    let uplinePath: string | null = '0';

    if (query.userId) {
      uplinePath = await this.userService.getUplinePathById(query.userId);
    } else if (userType === UserType.User) {
      uplinePath = await this.userService.getUplinePathById(uplineId);
    }
    console.log(uplinePath, 'uplinePath');

    if (!uplinePath) throw new Error('User not found');

    // 🔹 2. Resolve role
    let userRole = 'OWNER';

    if (query.userId) {
      const role = await this.userService.getRoleByUserId(query.userId);
      if (role) userRole = role.name;
    } else if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(uplineId);
      console.log(role, 'role');
      if (role) userRole = role.name;
    }
    console.log(userRole, 'userRole');

    // 🔹 3. Report depth condition (Prisma.sql ONLY)
    let reportDepthQuery = Prisma.sql``;

    if (userRole === 'MASTER') {
      reportDepthQuery = Prisma.sql`
      AND nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
    `;
    } else if (query.reportType === ReportType.DIRECT) {
      reportDepthQuery = Prisma.sql`
      AND (
        nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )
    `;
    } else {
      reportDepthQuery = Prisma.sql`
      AND NOT (
        nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )
    `;
    }

    // 🔹 4. MAIN QUERY (SAFE)
    const baseQuery = Prisma.sql`
    SELECT
      um.upline::text AS "directPath",
      u.username,
      u.id AS "userId",
      r.name AS "role",
      e.selection_id AS "selectionId",
      MAX(runner.runner_name) AS "selectionName",

      SUM(ue.total_pl)::decimal(16,2) AS "totalExposure",

      SUM(
        CASE
          WHEN ${uplinePath} = '0' THEN ue.upline_pl
          ELSE ue.upline_pl
        END
      )::decimal(16,2) AS "uplinePl"

    FROM upline_exposure ue
    JOIN exposure e ON e.id = ue.exposure_id
    JOIN "user" u ON u.id = e.user_id
    JOIN user_meta um ON um.user_id = u.id
    JOIN role r ON r.id = u.role_id

    LEFT JOIN market m
      ON m.external_id = e.market_external_id
      AND m.event_id = e.event_id

    LEFT JOIN LATERAL (
      SELECT runner_elem->>'runnerName' AS runner_name
      FROM jsonb_array_elements(m.runner::jsonb) AS runner_elem
      WHERE runner_elem->>'selectionId' = e.selection_id
      LIMIT 1
    ) runner ON true

    WHERE um.upline <@ text2ltree(${uplinePath})
      ${reportDepthQuery}
      AND r.name != 'DEMO'
      AND e.event_id = ${query.eventId}
      AND e.market_external_id = ${query.marketExtenralId}
      AND e.status::text = 'active'
      AND ${uplineCondition}

    GROUP BY
      um.upline,
      u.username,
      u.id,
      r.name,
      e.selection_id

    ORDER BY
      u.username,
      e.selection_id
  `;

    // 🔹 5. Build uplines
    const uplineIds = uplinePath.split('.');
    uplineIds.shift();

    const uplineData: any[] = [
      { id: '', path: '0', username: '', role: 'OWNER' },
    ];

    for (const uid of uplineIds) {
      const res = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        u.id,
        u.username,
        um.upline::text AS path,
        r.name AS role
      FROM "user" u
      JOIN user_meta um ON um.user_id = u.id
      JOIN role r ON r.id = u.role_id
      WHERE u.id = ${BigInt(uid)}
        AND r.name != 'DEMO'
    `);

      if (res.length) {
        uplineData.push({
          id: res[0].id.toString(),
          username: res[0].username,
          uplinePath: res[0].path,
          role: res[0].role,
        });
      }
    }

    // 🔹 6. DIRECT / MASTER
    if (userRole === 'MASTER' || query.reportType === ReportType.DIRECT) {
      const rows = await this.prisma.$queryRaw<any[]>(baseQuery);
      return { data: this.groupByUser(rows), uplines: uplineData };
    }

    // 🔹 7. HIERARCHY
    const downlines = await this.prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      u.id AS "userId",
      u.username,
      um.upline::text AS "directPath",
      r.name AS role
    FROM "user" u
    JOIN user_meta um ON um.user_id = u.id
    JOIN role r ON r.id = u.role_id
    WHERE um.upline <@ text2ltree(${uplinePath})
      AND nlevel(um.upline) = nlevel(text2ltree(${uplinePath})) + 1
      AND r.name != 'DEMO'
  `);

    for (const user of downlines) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
    WITH base AS (${baseQuery})
    SELECT
      "selectionId",
      "selectionName",
      SUM("totalExposure")::decimal(16,2) AS "totalExposure",
      SUM("uplinePl")::decimal(16,2) AS "uplinePl"
    FROM base
    WHERE text2ltree("directPath") <@ text2ltree(${user.directPath})
    GROUP BY "selectionId", "selectionName"
  `);

      user.selections = rows.map((r) => ({
        selectionId: r.selectionId,
        selectionName: r.selectionName ?? r.selectionId,
        exposure: Number(r.totalExposure),
        uplinePl: Number(r.uplinePl),
      }));
    }

    return {
      data: downlines.filter((d) => d.selections?.length),
      uplines: uplineData,
    };
  }

  private groupByUser(
    data: {
      directPath: string | null;
      username: string | null;
      userId: bigint | number | null;
      role: string | null;
      selectionId: string | null;
      selectionName: string | null;
      totalExposure: number | null;
    }[],
  ) {
    const grouped = data.reduce(
      (acc, row) => {
        const key = `${row.directPath}_${row.username}`;

        if (!acc[key]) {
          acc[key] = {
            directPath: row.directPath,
            username: row.username,
            userId: row.userId,
            role: row.role,
            selections: [],
          };
        }

        // selections
        acc[key].selections.push({
          selectionId: row.selectionId,
          selectionName: row.selectionName ?? row.selectionId,
          exposure: Number(row.totalExposure),
        });

        return acc;
      },
      {} as Record<string, any>,
    );

    return Object.values(grouped);
  }
}
