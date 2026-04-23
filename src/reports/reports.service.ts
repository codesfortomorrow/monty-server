import { BaseService, Pagination, UserType } from '@Common';
import { Injectable } from '@nestjs/common';
import {
  BetReportsRequest,
  CasinoProfitLossReportsRequest,
  DownlineProfitLossRequest,
  EventProfitLossRequest,
  GameType,
  MarketProfitLossRequest,
  // PlayerCasinoProfitLossRequest,
  PlayerProfitLossRequest,
  ReportType,
} from './dto';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { UsersService } from 'src/users';
import { CasinoBetReportsRequest } from './dto/casino-bet-reports.request';
import {
  ExportFormat,
  ExportStatus,
  ExportType,
  SportType,
} from '@prisma/client';

@Injectable()
export class ReportsService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly userService: UsersService,
  ) {
    super({ loggerDefaultMeta: { service: ReportsService.name } });
  }

  async getBetReports(
    userId: bigint,
    userType: UserType,
    query: BetReportsRequest,
    isExport?: boolean,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    try {
      const page = query.page && query.page > 0 ? query.page : 1;
      const limit = query.limit ?? 10;
      const skip = (page - 1) * limit;
      let reportLimit = '';
      if (!isExport) {
        reportLimit += 'OFFSET $14 LIMIT $15';
      }

      let userRole = 'OWNER';
      if (userType === UserType.User) {
        const role = await this.userService.getRoleByUserId(userId);
        if (role) userRole = role.name;
      }

      let reportDepthQuery = '';
      if (query.reportType === ReportType.DIRECT || userRole === 'MASTER') {
        reportDepthQuery += `AND (
          nlevel(um.upline) = nlevel(text2ltree($5)) + 1
          OR EXISTS (
            SELECT 1
            FROM user_meta pum
            JOIN "user" pu ON pu.id = pum.user_id
            JOIN role pr ON pr.id = pu.role_id
            WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
              AND pr.name = 'USER'
          )
        )`;
      } else {
        reportDepthQuery += `AND NOT (
          nlevel(um.upline) = nlevel(text2ltree($5)) + 1
          OR EXISTS (
            SELECT 1
            FROM user_meta pum
            JOIN "user" pu ON pu.id = pum.user_id
            JOIN role pr ON pr.id = pu.role_id
            WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
              AND pr.name = 'USER'
          )
        )`;
      }

      const sqlQuery = `
          SELECT 
            b.id,
            b.event_id AS "eventId",
            e.name AS "eventName",
            b.sport,
            b.market_id AS "marketId",
            b.market_name AS "marketName",
            b.market_type AS "marketType",
            b.amount,
            b.odds,
            b.percentage,
            b.bet_on AS "betOn",
            b.selection,
            b.selection_id AS "selectionId",
            b.user_id AS "userId",
            b.payout,
            b.status,
            b.ip,
            b.is_bookmaker AS "isBookmaker",
            b.placed_at AS "placedAt",
            b.settled_at AS "settledAt",
            u.username,
            um.upline,
            CASE
              WHEN rt.result_selection IS NOT NULL THEN rt.result_selection
              ELSE rt.result
            END AS result
          FROM bet b
          JOIN event e ON e.id = b.event_id
          JOIN user_meta um ON um.user_id = b.user_id
          JOIN "user" u ON u.id = b.user_id
          JOIN role r ON r.id = u.role_id
          LEFT JOIN result rt ON rt.event_id = b.event_id AND rt.market_external_id = b.market_id
          WHERE 
            r.name != 'DEMO'
            AND ($1::text IS NULL OR e.name ILIKE '%' || $1 || '%'
              OR b.market_name ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR u.username ILIKE '%' || $2 || '%')
            AND ($3::timestamptz IS NULL OR b.placed_at >= $3)
            AND ($4::timestamptz IS NULL OR b.placed_at <= $4)
            AND um.upline <@ text2ltree($5::text)
            ${reportDepthQuery}
            AND ($6::bigint IS NULL OR b.id = $6::bigint)
            AND ($7::int IS NULL OR e.competition_id = $7::int)
            AND ($8::bigint IS NULL OR b.event_id = $8::bigint)
            AND ($9::text IS NULL OR b.market_id = $9::text)
            AND ($10::text IS NULL OR b.market_type ILIKE $10::text)
            AND ($11::text IS NULL OR b.status = $11::bet_status_type)
            AND ($12::text IS NULL OR b.sport = $12::sport_type)
            AND ($13::bigint IS NULL OR u.id = $13::bigint)
          ORDER BY b.placed_at DESC
          ${reportLimit};
      `;

      let sport = null;
      if (query.sport) sport = query.sport?.toLowerCase();
      if (query.sport === SportType.HorseRacing) sport = 'horse_racing';
      const params = [
        query.search || null,
        query.searchByUserName || null,
        query.fromDate || null,
        query.toDate || null,
        uplinePath,
        query.betId || null,
        query.competitionId || null,
        query.eventId || null,
        query.marketId || null,
        query.market || null,
        query.status?.toLowerCase() || null,
        sport,
        query.searchByUserId || null,
        skip,
        limit,
      ];

      const bets = await this.prisma.$queryRawUnsafe<
        {
          id: number;
          eventId: number;
          eventName: string | null;
          sport: string | null;
          marketId: string | null;
          marketName: string | null;
          marketType: string | null;
          amount: number | null;
          odds: number | null;
          percentage: number | null;
          betOn: string | null;
          selection: string | null;
          selectionId: string | null;
          userId: bigint;
          payout: number | null;
          status: string | null;
          ip: string | null;
          isBookmaker: boolean | null;
          placedAt: Date | null;
          settledAt: Date | null;
          username: string | null;
          upline: string | null;
          result: string | null;
        }[]
      >(sqlQuery, ...params);

      const userIds = new Set(bets.map((bet) => bet.userId));
      const uplineMap = await this.getUplineDetails([...userIds]);

      const mappedBet = bets.map((bet) => {
        const uplineDetails = uplineMap.get(bet.userId);
        return {
          ...bet,
          uplineDetails,
        };
      });

      const countSql = `
        SELECT COUNT(*) AS total
        FROM bet b
          JOIN event e ON e.id = b.event_id
          JOIN user_meta um ON um.user_id = b.user_id
          JOIN "user" u ON u.id = b.user_id
          JOIN role r ON r.id = u.role_id
          WHERE 
            r.name != 'DEMO'
            AND ($1::text IS NULL OR e.name ILIKE '%' || $1 || '%'
              OR b.market_name ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR u.username ILIKE '%' || $2 || '%')
            AND ($3::timestamptz IS NULL OR b.placed_at >= $3)
            AND ($4::timestamptz IS NULL OR b.placed_at <= $4)
            AND um.upline <@ text2ltree($5::text)
            ${reportDepthQuery}
            AND ($6::bigint IS NULL OR b.id = $6::bigint)
            AND ($7::int IS NULL OR e.competition_id = $7::int)
            AND ($8::bigint IS NULL OR b.event_id = $8::bigint)
            AND ($9::text IS NULL OR b.market_id = $9::text)
            AND ($10::text IS NULL OR b.market_type ILIKE $10::text)
            AND ($11::text IS NULL OR b.status = $11::bet_status_type)
            AND ($12::text IS NULL OR b.sport = $12::sport_type)
            AND ($13::bigint IS NULL OR u.id = $13::bigint)
      `;

      const countParams = [
        query.search || null,
        query.searchByUserName || null,
        query.fromDate || null,
        query.toDate || null,
        uplinePath,
        query.betId || null,
        query.competitionId || null,
        query.eventId || null,
        query.marketId || null,
        query.market || null,
        query.status?.toLowerCase() || null,
        sport,
        query.searchByUserId || null,
      ];

      const countResult = await this.prisma.$queryRawUnsafe<
        { total: number }[]
      >(countSql, ...countParams);

      const totalItems = Number(countResult?.[0]?.total || 0);

      const pagination: Pagination = isExport
        ? {
            currentPage: 1,
            limit: totalItems,
            totalItems,
            totalPage: 1,
          }
        : {
            currentPage: page,
            limit: limit!,
            totalItems,
            totalPage: Math.ceil(totalItems / limit!),
          };

      return {
        bets: mappedBet,
        pagination,
      };
    } catch (error) {
      this.logger.error(
        `Error to generate bet list reports. Error: ${error.message}`,
      );
      throw new Error('Internal server error');
    }
  }

  private async getUplineDetails(userIds: bigint[]) {
    const map = new Map<bigint, Record<string, string>>();
    for (const userId of userIds) {
      const redisKey = `upline:${userId}`;
      const data = await this.redis.client.get(redisKey);
      if (data) {
        try {
          const uplineDetails = JSON.parse(data) as Record<string, string>;
          map.set(userId, uplineDetails);
          continue;
        } catch (error) {
          this.logger.warn(
            `Error to parse redis upline data for userId ${userId}, Error: ${error.message}`,
          );
        }
      }
      const uplinePath = await this.userService.getUplinePathById(userId);
      if (!uplinePath) continue;
      const uplineIds = uplinePath.split('.');
      uplineIds.shift(); // Remove Owner
      uplineIds.pop(); // Remove Self
      const ownRole = await this.userService.getRoleByUserId(userId);

      const uplineMap: Record<string, string> = {};
      for (const uplineId of uplineIds) {
        const user = await this.userService.getRoleAndUsernameByUserId(
          BigInt(uplineId),
        );
        if (
          user.role &&
          ownRole &&
          ownRole.name !== user.role.name &&
          user.username
        ) {
          uplineMap[user.role.name] = user.username;
        }
      }

      await this.redis.client.setex(
        redisKey,
        5 * 60,
        JSON.stringify(uplineMap),
      );
      map.set(userId, uplineMap);
    }
    return map;
  }

  private async getDirectUplineDetails(userIds: bigint[]) {
    const map = new Map<bigint, Record<string, string>>();
    for (const userId of userIds) {
      const redisKey = `upline:direct:${userId}`;
      const data = await this.redis.client.get(redisKey);
      if (data) {
        try {
          const uplineDetails = JSON.parse(data) as Record<string, string>;
          map.set(userId, uplineDetails);
          continue;
        } catch (error) {
          this.logger.warn(
            `Error to parse redis upline data for userId ${userId}, Error: ${error.message}`,
          );
        }
      }
      const uplinePath = await this.userService.getUplinePathById(userId);
      if (!uplinePath) continue;
      const uplineIds = uplinePath.split('.');
      uplineIds.shift(); // Remove Owner
      uplineIds.pop(); // Remove Self
      const ownRole = await this.userService.getRoleByUserId(userId);

      const uplineMap: Record<string, string> = {};
      for (let i = uplineIds.length - 1; i >= 0; i++) {
        const uplineId = uplineIds[i];
        const user = await this.userService.getRoleAndUsernameByUserId(
          BigInt(uplineId),
        );
        if (
          user.role &&
          ownRole &&
          ownRole.name !== user.role.name &&
          user.username
        ) {
          uplineMap.name = user.username;
          uplineMap.role = user.role.name;
          break;
        }
      }

      await this.redis.client.setex(
        redisKey,
        5 * 60,
        JSON.stringify(uplineMap),
      );
      map.set(userId, uplineMap);
    }
    return map;
  }

  async getPlayerProfitLoss(
    userId: bigint,
    userType: UserType,
    query: PlayerProfitLossRequest,
    isExport?: boolean,
  ) {
    const {
      page = 1,
      limit = 10,
      searchByUsername = null,
      searchByUserId = null,
      transactionLimit = null,
      fromDate = null,
      toDate = null,
      sport = null,
    } = query;

    const skip = (page - 1) * limit;

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $9 OFFSET $10';
    }

    let uplinePath;
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    else uplinePath = '0';

    // let limitOffset = '';
    // if (transactionLimit) {
    //   limitOffset = `LIMIT ${transactionLimit} OFFSET 0`;
    // }

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportDepthQuery = '';
    if (query.reportType === ReportType.DIRECT || userRole === 'MASTER') {
      reportDepthQuery += `AND (
        nlevel(um.upline) = nlevel(text2ltree($1)) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )`;
    } else {
      reportDepthQuery += `AND NOT (
        nlevel(um.upline) = nlevel(text2ltree($1)) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )`;
    }

    let sportFilter = null;
    if (sport) sportFilter = sport?.toLowerCase();
    if (sport === SportType.HorseRacing) sportFilter = 'horse_racing';

    const sql = `
        WITH base_bets AS (
          SELECT 
            b.id,
            b.user_id,
            u.username,
            b.event_id,
            b.payout,
            b.sport,
            um.upline,
            ROW_NUMBER() OVER (
              PARTITION BY b.user_id
              ORDER BY b.placed_at DESC
            ) AS rn
          FROM bet b
          JOIN "user" u ON u.id = b.user_id
          JOIN role r ON r.id = u.role_id
          JOIN user_meta um ON um.user_id = u.id
          WHERE 
            r.name = 'USER'
            AND (b.status = 'won' OR b.status = 'lost')
            AND um.upline <@ text2ltree($1::text)
            ${reportDepthQuery}
            AND b.user_id != $2::bigint
            AND ($3::timestamptz IS NULL OR b.placed_at >= $3)
            AND ($4::timestamptz IS NULL OR b.placed_at <= $4)
            AND ($5::text IS NULL OR LOWER(u.username) ILIKE '%' || $5 || '%')
            
            AND ($6::text IS NULL OR b.sport = $6::sport_type)
            AND ($7::bigint IS NULL OR u.id = $7::bigint)
        ),

        limited_bets AS (
          SELECT * FROM base_bets
          WHERE 
            $8::int IS NULL OR rn <= $8
        )

        SELECT 
          user_id AS "userId",
          username,
          COALESCE(SUM(payout), 0) AS "profitLoss"
        FROM limited_bets
        GROUP BY user_id, username
        ORDER BY username
        ${reportLimit};
      `;
    //--- AND ($6::int IS NULL OR rn <= $6)
    const result = await this.prisma.$queryRawUnsafe<
      { userId: bigint; username: string; profitLoss: number }[]
    >(
      sql,
      uplinePath, // $1: downline path
      userId, // $2: exclude self
      fromDate || null, // $3: startDate
      toDate || null, // $4: endDate
      searchByUsername || null, // $5: search by username
      sportFilter, // $6: sport filter
      searchByUserId || null, // $7: search by user id
      transactionLimit || null, // $8: transaction limit per user
      limit, // $9: pagination limit
      skip, // $10: pagination offset
    );

    const userIds = new Set(result.map((profitLoss) => profitLoss.userId));
    const uplineMap = await this.getDirectUplineDetails([...userIds]);

    const mappedProfitLoss = result.map((profitLoss) => {
      const uplineDetails = uplineMap.get(profitLoss.userId);
      return {
        ...profitLoss,
        uplineDetails,
      };
    });

    const countSql = `
    SELECT COUNT(DISTINCT b.user_id) AS total
    FROM bet b
    JOIN event e ON e.id = b.event_id
    JOIN "user" u ON u.id = b.user_id
    JOIN role r ON r.id = u.role_id
    JOIN user_meta um ON um.user_id = u.id
    WHERE 
      r.name = 'USER'
      AND (b.status = 'won' OR b.status = 'lost')
      AND um.upline <@ text2ltree($1::text)
      ${reportDepthQuery}
      AND ($2::timestamptz IS NULL OR b.placed_at >= $2)
      AND ($3::timestamptz IS NULL OR b.placed_at <= $3)
      AND ($4::sport_type IS NULL OR e.sport = $4::sport_type)
      AND b.user_id != $5::bigint
      AND ($6::text IS NULL OR u.username ILIKE '%' || $6 || '%')
      AND ($7::bigint IS NULL OR u.id = $7::bigint)
  `;

    const countResult = await this.prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      uplinePath,
      fromDate || null,
      toDate || null,
      sportFilter,
      userId,
      searchByUsername || null,
      searchByUserId || null,
    );

    const totalItems = Number(countResult?.[0]?.total || 0);

    const totalProfitLoss = mappedProfitLoss.reduce(
      (sum, user) => sum + Number(user.profitLoss),
      0,
    );
    // const pagination: Pagination = {
    //   currentPage: page,
    //   limit,
    //   totalItems,
    //   totalPage: Math.ceil(totalItems / limit),
    // };
    const pagination: Pagination = isExport
      ? {
          currentPage: 1,
          limit: totalItems,
          totalItems,
          totalPage: 1,
        }
      : {
          currentPage: page,
          limit: limit!,
          totalItems,
          totalPage: Math.ceil(totalItems / limit!),
        };

    return { users: mappedProfitLoss, pagination, totalProfitLoss };
  }

  async casinoBetReport(
    userId: bigint | number,
    userType: UserType,
    query: CasinoBetReportsRequest,
    isExport?: boolean,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'OFFSET $9 LIMIT $10';
    }

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportDepthQuery = '';
    if (query.reportType === ReportType.DIRECT || userRole === 'MASTER') {
      reportDepthQuery += `AND (
        nlevel(um.upline) = nlevel(text2ltree($5)) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )`;
    } else {
      reportDepthQuery += `AND NOT (
        nlevel(um.upline) = nlevel(text2ltree($5)) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )`;
    }

    const sqlQuery = `
        SELECT 
          b.id,
          b.game_id AS "gameId",
          b.game_name AS "gameName",
          g.external_id AS "gameExternalId",
          g.code AS "gameCode",
          g.game_provider_name AS "gameProviderName",
          g.category,
          b.status,
          b.round_id AS "roundId",
          b.txn_id AS "txnId",
          b.total_bets AS "totalBets",
          b.total_wins AS "totalWins",
          b.total_losses AS "totalLosses",
          b.user_id AS "userId",
          b.completed,
          b.created_at AS "createdAt",
          u.username,
          um.upline
        FROM casino_round_histories b
        JOIN casino_game g ON g.id = b.game_id
        JOIN user_meta um ON um.user_id = b.user_id
        JOIN "user" u ON u.id = b.user_id
        JOIN role r ON r.id = u.role_id
        WHERE 
          r.name != 'DEMO'
          AND (b.status = 'won' OR b.status = 'lost')
          AND ($1::text IS NULL OR b.game_name ILIKE '%' || $1 || '%'
            OR g.game_provider_name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR u.username ILIKE '%' || $2 || '%')
          AND ($3::timestamptz IS NULL OR b.created_at >= $3)
          AND ($4::timestamptz IS NULL OR b.created_at <= $4)
          AND um.upline <@ text2ltree($5::text)
          ${reportDepthQuery}
          AND ($6::bigint IS NULL OR u.id = $6::bigint)
          AND ($7::int IS NULL OR g.id = $7::int)
          AND ($8::bet_status_type IS NULL OR b.status = $8::bet_status_type)
        ORDER BY b.created_at DESC
        ${reportLimit};
    `;

    const params = [
      query.search || null,
      query.searchByUserName || null,
      query.fromDate || null,
      query.toDate || null,
      uplinePath,
      query.searchByUserId || null,
      query.gameId || null,
      query.status?.toLowerCase() || null,
      skip,
      limit,
    ];

    const casinoBets = await this.prisma.$queryRawUnsafe<
      {
        id: number;
        gameId: number | bigint | null;
        gameName: string | null;
        gameExternalId: string | null;
        gameCode: string | null;
        gameProviderName: string | null;
        category: string | null;
        status: string | null;
        roundId: string | null;
        txnId: string | null;
        totalBets: number | null;
        totalWins: number | null;
        totalLosses: number | null;
        userId: bigint;
        completed: boolean | null;
        createdAt: Date | null;
        username: string | null;
        upline: string | null;
      }[]
    >(sqlQuery, ...params);

    const userIds = new Set(casinoBets.map((bet) => bet.userId));
    const uplineMap = await this.getUplineDetails([...userIds]);

    const mappedBet = casinoBets.map((bet) => {
      const uplineDetails = uplineMap.get(bet.userId);
      return {
        ...bet,
        uplineDetails,
      };
    });

    const countSql = `
      SELECT COUNT(*) AS total
      FROM casino_round_histories b
      JOIN casino_game g ON g.id = b.game_id
      JOIN user_meta um ON um.user_id = b.user_id
      JOIN "user" u ON u.id = b.user_id
      JOIN role r ON r.id = u.role_id
      WHERE 
        r.name != 'DEMO'
        AND (b.status = 'won' OR b.status = 'lost')
        AND ($1::text IS NULL OR b.game_name ILIKE '%' || $1 || '%'
          OR g.game_provider_name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR u.username ILIKE '%' || $2 || '%')
        AND ($3::timestamptz IS NULL OR b.created_at >= $3)
        AND ($4::timestamptz IS NULL OR b.created_at <= $4)
        AND um.upline <@ text2ltree($5::text)
        ${reportDepthQuery}
        AND ($6::bigint IS NULL OR u.id = $6::bigint)
        AND ($7::int IS NULL OR g.id = $7::int)
        AND ($8::bet_status_type IS NULL OR b.status = $8::bet_status_type)
    `;

    const countResult = await this.prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      query.search || null,
      query.searchByUserName || null,
      query.fromDate || null,
      query.toDate || null,
      uplinePath,
      query.searchByUserId || null,
      query.searchByGameId || null,
      query.status?.toLowerCase() || null,
    );

    const totalItems = Number(countResult?.[0]?.total || 0);
    // const pagination: Pagination = {
    //   currentPage: page,
    //   limit,
    //   totalItems,
    //   totalPage: Math.ceil(totalItems / limit),
    // };
    const pagination: Pagination = isExport
      ? {
          currentPage: 1,
          limit: totalItems,
          totalItems,
          totalPage: 1,
        }
      : {
          currentPage: page,
          limit: limit!,
          totalItems,
          totalPage: Math.ceil(totalItems / limit!),
        };
    return { casinoBets: mappedBet, pagination };
  }

  async playerCasinoProfitReport(
    userId: bigint | number,
    userType: UserType,
    query: CasinoProfitLossReportsRequest,
    isExport?: boolean,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'OFFSET $7 LIMIT $8';
    }

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportDepthQuery = '';
    if (query.reportType === ReportType.DIRECT || userRole === 'MASTER') {
      reportDepthQuery += `AND (
        nlevel(um.upline) = nlevel(text2ltree($4)) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )`;
    } else {
      reportDepthQuery += `AND NOT (
        nlevel(um.upline) = nlevel(text2ltree($4)) + 1
        OR EXISTS (
          SELECT 1
          FROM user_meta pum
          JOIN "user" pu ON pu.id = pum.user_id
          JOIN role pr ON pr.id = pu.role_id
          WHERE pum.upline = subpath(um.upline, 0, nlevel(um.upline) - 1)
            AND pr.name = 'USER'
        )
      )`;
    }

    const sqlQuery = `
      WITH base_bets AS (
        SELECT 
          b.id,
          b.total_bets,
          b.total_wins,
          b.total_losses,
          b.user_id,
          b.completed,
          b.created_at,
          u.username,
          um.upline,
          ROW_NUMBER() OVER (
            PARTITION BY b.user_id
            ORDER BY b.created_at DESC
          ) AS rn
        FROM casino_round_histories b
        JOIN casino_game g ON g.id = b.game_id
        JOIN user_meta um ON um.user_id = b.user_id
        JOIN "user" u ON u.id = b.user_id
        JOIN role r ON r.id = u.role_id
        WHERE 
          r.name != 'DEMO'
          AND (b.status = 'won' OR b.status = 'lost')
          AND r.name != 'BANKER'
          AND ($1::text IS NULL OR u.username ILIKE '%' || $1 || '%')
          AND ($2::timestamptz IS NULL OR b.created_at >= $2)
          AND ($3::timestamptz IS NULL OR b.created_at <= $3)
          AND um.upline <@ text2ltree($4::text)
          ${reportDepthQuery}
          AND ($5::bigint IS NULL OR u.id = $5::bigint)
        ORDER BY b.created_at DESC
      ),

      limited_bets AS (
        SELECT * FROM base_bets
        WHERE 
          $6::int IS NULL OR rn <= $6
      ),

      grouped AS (
        SELECT 
          user_id AS "userId",
          username,
          COUNT(*) AS "totalBets",
          COALESCE(SUM(total_wins - total_bets), 0) AS "totalProfitLoss",
          COALESCE(SUM(total_bets), 0) AS "totalStake"
        FROM limited_bets
        GROUP BY user_id, username
      )

      SELECT * FROM grouped
      ${reportLimit};
    `;

    const params = [
      query.searchByUserName || null,
      query.fromDate || null,
      query.toDate || null,
      uplinePath,
      query.searchByUserId || null,
      query.transactionLimit,
      skip,
      limit,
    ];

    const casinoProfitLoss = await this.prisma.$queryRawUnsafe<
      {
        userId: bigint;
        username: string | null;
        totalBets: number | null;
        totalProfitLoss: number | null;
        totalStake: number | null;
      }[]
    >(sqlQuery, ...params);

    const userIds = new Set(
      casinoProfitLoss.map((profitLoss) => profitLoss.userId),
    );
    const uplineMap = await this.getDirectUplineDetails([...userIds]);

    const mappedProfitLoss = casinoProfitLoss.map((profitLoss) => {
      const uplineDetails = uplineMap.get(profitLoss.userId);
      return {
        ...profitLoss,
        uplineDetails,
      };
    });

    const countSql = `
    SELECT COUNT(DISTINCT b.user_id) AS total
    FROM casino_round_histories b
        JOIN casino_game g ON g.id = b.game_id
        JOIN user_meta um ON um.user_id = b.user_id
        JOIN "user" u ON u.id = b.user_id
        JOIN role r ON r.id = u.role_id
        WHERE 
          r.name != 'DEMO'
          AND (b.status = 'won' OR b.status = 'lost')
          AND ($1::text IS NULL OR u.username ILIKE '%' || $1 || '%')
          AND ($2::timestamptz IS NULL OR b.created_at >= $2)
          AND ($3::timestamptz IS NULL OR b.created_at <= $3)
          AND um.upline <@ text2ltree($4::text)
          ${reportDepthQuery}
          AND ($5::bigint IS NULL OR u.id = $5::bigint)
  `;

    const countResult = await this.prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      query.searchByUserName || null,
      query.fromDate || null,
      query.toDate || null,
      uplinePath,
      query.searchByUserId || null,
    );

    const totalItems = Number(countResult?.[0]?.total || 0);

    const totals = mappedProfitLoss.reduce(
      (sum, user) => {
        const profitLoss =
          sum.totalProfitLoss + Number(user.totalProfitLoss || 0);
        const stake = sum.totalStake + Number(user.totalStake || 0);
        return { totalProfitLoss: profitLoss, totalStake: stake };
      },
      { totalProfitLoss: 0, totalStake: 0 },
    );
    const pagination: Pagination = {
      currentPage: page,
      limit,
      totalItems,
      totalPage: Math.ceil(totalItems / limit),
    };
    return { casinoProfitLoss: mappedProfitLoss, pagination, totals };
  }

  async exportBetReports(
    userId: bigint,
    userType: UserType,
    query: BetReportsRequest,
  ) {
    try {
      const isAdmin = userType === UserType.Admin;
      const exportEntry = await this.prisma.export.create({
        data: {
          timestamp: new Date(),
          type: ExportType.betReports,
          format: query.exportFormat ?? ExportFormat.Excel,
          status: ExportStatus.Pending,
          userId: isAdmin ? undefined : userId,
          adminId: isAdmin ? userId : undefined,
          name: query.fileName ?? 'Bet List',
          timezone: query.timezone,
          filters: {
            searchByUserName: query.searchByUserName,
            searchByUserId: query.searchByUserId,
            userType: userType,
            search: query.search,
            betId: query.betId?.toString(),
            competitionId: query.competitionId?.toString(),
            eventId: query.eventId?.toString(),
            marketId: query.marketId,
            market: query.market,
            status: query.status,
            sport: query.sport,
            reportType: query.reportType,
            fromDate: query.fromDate?.toISOString(),
            toDate: query.toDate?.toISOString(),
          },
        },
      });

      return {
        success: true,
        message: 'Your bet reports export has been successfully initiated',
        exportId: exportEntry.id,
        status: exportEntry.status,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to initiate bet reports export',
        error: error.message,
      };
    }
  }

  async exportCasinoBetReports(
    userId: bigint,
    userType: UserType,
    query: CasinoBetReportsRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.casinoBetReports,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        name: query.fileName ?? 'Casino Bet List',
        // owner mapping
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        timezone: query.timezone,
        filters: {
          searchByUserName: query.searchByUserName,
          searchByUserId: query.searchByUserId?.toString(),
          searchByGameId: query.searchByGameId?.toString(),
          userType,
          search: query.search,
          betId: query.betId?.toString(),
          gameId: query.gameId?.toString(),
          status: query.status,
          reportType: query.reportType,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message: 'Your casino bet reports export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportCasinoPlayerProfitLossReports(
    userId: bigint,
    userType: UserType,
    path: string,
    query: CasinoProfitLossReportsRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.casinoPlayerProfitLoss,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Profit/Loss by Casino Players',
        timezone: query.timezone,
        filters: {
          userType,
          searchByUserName: query.searchByUserName,
          searchByUserId: query.searchByUserId,
          transactionLimit: query.transactionLimit,
          reportType: query.reportType,
          path: path,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message:
        'Your casino player profit/loss export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportCasinoDownlineProfitLossReports(
    userId: bigint,
    userType: UserType,
    path: string,
    query: CasinoProfitLossReportsRequest,
  ) {
    const isAdmin = userType === UserType.Admin;
    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.casinoDownlineProfitLoss,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Profit/Loss by Casino Downline',
        timezone: query.timezone,
        filters: {
          userType,
          searchByUserName: query.searchByUserName,
          searchByUserId: query.searchByUserId,
          reportType: query.reportType,
          transactionLimit: query.transactionLimit,
          path: path,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message:
        'Your casino downline profit/loss export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportPlayerProfitLossReports(
    userId: bigint,
    userType: UserType,
    query: PlayerProfitLossRequest,
  ) {
    const isAdmin = userType === UserType.Admin;
    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.playerProfitLoss,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        name: query.fileName ?? 'Profit/Loss by Player',
        // owner mapping
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        timezone: query.timezone,

        filters: {
          searchByUsername: query.searchByUsername,
          userType,
          transactionLimit: query.transactionLimit,
          sport: query.sport,
          searchByUserId: query.searchByUserId,
          reportType: query.reportType,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message:
        'Your player profit & loss export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportEventProfitLossReports(
    userId: bigint,
    userType: UserType,
    query: EventProfitLossRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.eventProfitLoss,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Profit/Loss Report by Event',
        timezone: query.timezone,
        filters: {
          searchByEvent: query.searchByEvent,
          userType,
          searchByUserId: query.userId,
          transactionLimit: query.transactionLimit,
          sport: query.sport,
          gameType: query.gameType,
          gameCategory: query.gameCategory,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message:
        'Your event profit & loss export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportDownlineProfitLossReports(
    userId: bigint,
    userType: UserType,
    path: string,
    query: DownlineProfitLossRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.downlineProfitLoss,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,

        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        timezone: query.timezone,
        name: query.fileName ?? 'Profit & Loss Report By Downline',
        filters: {
          userType,
          searchByUserName: query.searchByUserName,
          transactionLimit: query.transactionLimit,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
          path: path,
        },
      },
    });

    return {
      message:
        'Your downline profit/loss export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async getDownlineProfitLoss(
    userId: bigint | number,
    userType: UserType,
    path: string,
    query: DownlineProfitLossRequest,
    isExport?: boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;

    let uplinePath: string | null = '0';
    let ap: number = 100;
    if (userType === UserType.User) {
      uplinePath = await this.userService.getUplinePathById(userId);
      const user = await this.userService.getPartnership(BigInt(userId));
      if (user) {
        ap = user.partnership;
      }
    }
    if (!uplinePath) throw new Error('User not found');

    try {
      const { downlineUsers, pagination } =
        await this.userService.getDownlineUserWithRoleExceptBanker({
          uplinePath,
          userId: BigInt(userId),
          search: query.searchByUserName,
          level: 1,
          excludeSelfUser: userType === UserType.Admin,
          limit,
          page,
          isExport,
        });

      const users: any[] = [];
      for (const usr of downlineUsers) {
        const plSummary = await this.prisma.$queryRawUnsafe<
          { totalPl: number; uplinePl: number }[]
        >(
          `
        SELECT 
          COALESCE(SUM(bp.total_pl), 0) AS "totalPl",
          COALESCE(SUM(bp.upline_pl), 0) AS "uplinePl"
        FROM bet_pl bp
        WHERE bp.upline_id = $1
          AND bp.category = 'sport'
          AND ($2::timestamptz IS NULL OR bp.created_at >= $2)
          AND ($3::timestamptz IS NULL OR bp.created_at <= $3)
        `,
          BigInt(usr.id),
          query.fromDate ?? null,
          query.toDate ?? null,
        );
        let profitLoss = Number(plSummary[0]?.totalPl ?? 0);
        const clientPl =
          usr.role === 'USER'
            ? (profitLoss * (100 - ap)) / 100
            : Number(plSummary[0]?.uplinePl ?? 0);
        const partnership = Number(usr.partnership ?? 0);
        const uplinePl =
          usr.role === 'USER'
            ? (profitLoss * ap) / 100
            : (profitLoss * partnership) / 100;

        const downlinePl = usr.role === 'USER' ? 0 : profitLoss - uplinePl;
        profitLoss = profitLoss * -1;
        users.push({
          ...usr,
          profitLoss,
          clientPl,
          uplinePl,
          downlinePl,
        });
      }

      // Totals
      const totals = users.reduce((sum, u) => sum + u.profitLoss, 0);
      const totalClientPl = users.reduce((sum, u) => sum + u.clientPl, 0);
      const totalUplinePl = users.reduce((sum, u) => sum + u.uplinePl, 0);
      const totalDownlinePl = users.reduce((sum, u) => sum + u.downlinePl, 0);

      return {
        downlineUsers: users,
        pagination,
        totals,
        totalClientPl,
        totalUplinePl,
        totalDownlinePl,
      };
    } catch (error) {
      this.logger.error(
        `Error to generate downline profit/loss reports. Error: ${error.message}`,
      );
      throw new Error('Internal server error');
    }
  }

  async getEventProfitLossReport(
    userId: bigint,
    userType: UserType,
    query: EventProfitLossRequest,
    isExport = false,
  ) {
    const isAdmin = userType === UserType.Admin;

    const uplineCondition = isAdmin
      ? `bp.user_type = 'OWNER'`
      : `bp.upline_id = ${userId}`;

    try {
      const page = query.page && query.page > 0 ? query.page : 1;
      const limit = query.limit ?? 10;
      const skip = (page - 1) * limit;

      const paginationSql = isExport ? `` : `OFFSET ${skip} LIMIT ${limit}`;
      let sport = null;
      if (query.sport) sport = query.sport?.toLowerCase();
      if (query.sport === SportType.HorseRacing) sport = 'horse_racing';
      /* ============================================================
       🟢 SPORTS
    ============================================================ */
      if (query.gameType !== GameType.CASINO) {
        /* ---------- DATA ---------- */
        const dataSql = `
        WITH base AS (
          SELECT
            b.event_id,
            e.name AS event_name,
            e.sport,
            b.amount,
            b.placed_at,
            bp.total_pl,
            bp.upline_pl,
            (bp.total_pl - bp.upline_pl) AS downline_pl
          FROM bet_pl bp
          JOIN bet b ON b.id = bp.bet_id
          JOIN event e ON e.id = b.event_id
          WHERE
            bp.category::text = 'sport'
            AND ${uplineCondition}
            AND ($1::text IS NULL OR e.name ILIKE '%' || $1 || '%')
            AND ($2::timestamptz IS NULL OR bp.created_at >= $2)
            AND ($3::timestamptz IS NULL OR bp.created_at <= $3)
            AND ($4::sport_type IS NULL OR e.sport = $4::sport_type)
        )
        SELECT
          event_id        AS "eventId",
          event_name      AS "eventName",
          sport,
          COUNT(*)        AS "totalBets",
          SUM(total_pl)   AS "totalProfitLoss",
          SUM(upline_pl)  AS "uplineProfitLoss",
          SUM(downline_pl) AS "downlineProfitLoss",
          SUM(amount)     AS "totalStake",
          MAX(placed_at)  AS "lastBetTime"
        FROM base
        GROUP BY event_id, event_name, sport
        ORDER BY "lastBetTime" DESC
        ${paginationSql};
      `;

        const eventRows = await this.prisma.$queryRawUnsafe<
          {
            eventId: bigint | number | null;
            eventName: string | null;
            sport: string | null;
            totalBets: number | bigint | null;
            totalProfitLoss: number | null;
            uplineProfitLoss: number | null;
            downlineProfitLoss: number | null;
            totalStake: number | null;
            lastBetTime: Date | string | null;
          }[]
        >(
          dataSql,
          query.searchByEvent || null,
          query.fromDate || null,
          query.toDate || null,
          sport,
        );

        /* ---------- COUNT ---------- */
        const countSql = `
        SELECT COUNT(DISTINCT b.event_id) AS total
        FROM bet_pl bp
        JOIN bet b ON b.id = bp.bet_id
        JOIN event e ON e.id = b.event_id
        WHERE
          bp.category::text = 'sport'
          AND ${uplineCondition}
          AND ($1::text IS NULL OR e.name ILIKE '%' || $1 || '%')
          AND ($2::timestamptz IS NULL OR bp.created_at >= $2)
          AND ($3::timestamptz IS NULL OR bp.created_at <= $3)
          AND ($4::sport_type IS NULL OR e.sport = $4::sport_type);
      `;

        const countRes = await this.prisma.$queryRawUnsafe<{ total: number }[]>(
          countSql,
          query.searchByEvent || null,
          query.fromDate || null,
          query.toDate || null,
          sport,
        );

        const totalItems = Number(countRes?.[0]?.total ?? 0);

        const modified = eventRows.map((e) => ({
          ...e,
          totalProfitLoss: (e.totalProfitLoss ?? 0) * -1,
        }));

        return {
          eventRows: modified,
          pagination: {
            currentPage: page,
            limit,
            totalItems,
            totalPage: Math.ceil(totalItems / limit),
          },
        };
      }

      /* ============================================================
       🔵 CASINO
    ============================================================ */
      const casinoSql = `
      WITH base AS (
        SELECT
          g.id AS game_id,
          g.name AS game_name,
          g.category,
          g.game_provider_name,
          bp.total_pl,
          bp.upline_pl,
          (bp.total_pl - bp.upline_pl) AS downline_pl,
          bp.created_at
        FROM bet_pl bp
        JOIN casino_round_histories crh ON crh.id = bp.casino_id
        JOIN casino_game g ON g.id = crh.game_id
        WHERE
          bp.category::text = 'casino'
          AND ${uplineCondition}
          AND ($1::text IS NULL OR g.name ILIKE '%' || $1 || '%')
          AND ($2::timestamptz IS NULL OR bp.created_at >= $2)
          AND ($3::timestamptz IS NULL OR bp.created_at <= $3)
          AND ($4::text IS NULL OR g.category ILIKE '%' || $4 || '%')
      )
      SELECT
        game_id            AS "gameId",
        game_name          AS "gameName",
        category,
        game_provider_name AS "gameProviderName",
        COUNT(*)           AS "totalRounds",
        SUM(total_pl)      AS "totalProfitLoss",
        SUM(upline_pl)     AS "uplineProfitLoss",
        SUM(downline_pl)   AS "downlineProfitLoss",
        MAX(created_at)    AS "lastBetTime"
      FROM base
      GROUP BY game_id, game_name, category, game_provider_name
      ORDER BY "lastBetTime" DESC
      ${paginationSql};
    `;

      const casinoRows = await this.prisma.$queryRawUnsafe<
        {
          gameId: bigint | number | null;
          gameName: string | null;
          category: string | null;
          gameProviderName: string | null;
          totalRounds: bigint | number | null;
          totalProfitLoss: number | null;
          uplineProfitLoss: number | null;
          downlineProfitLoss: number | null;
          lastBetTime: Date | string | null;
        }[]
      >(
        casinoSql,
        query.searchByEvent || null,
        query.fromDate || null,
        query.toDate || null,
        query.gameCategory || null,
      );

      const casinoCountSql = `
      SELECT COUNT(DISTINCT g.id) AS total
      FROM bet_pl bp
      JOIN casino_round_histories crh ON crh.id = bp.casino_id
      JOIN casino_game g ON g.id = crh.game_id
      WHERE
        bp.category::text = 'casino'
        AND ${uplineCondition}
        AND ($1::text IS NULL OR g.name ILIKE '%' || $1 || '%')
        AND ($2::timestamptz IS NULL OR bp.created_at >= $2)
        AND ($3::timestamptz IS NULL OR bp.created_at <= $3)
        AND ($4::text IS NULL OR g.category ILIKE '%' || $4 || '%');
    `;

      const casinoCount = await this.prisma.$queryRawUnsafe<
        { total: number }[]
      >(
        casinoCountSql,
        query.searchByEvent || null,
        query.fromDate || null,
        query.toDate || null,
        query.gameCategory || null,
      );

      const totalItems = Number(casinoCount?.[0]?.total ?? 0);

      const modified = casinoRows.map((c) => ({
        ...c,
        totalProfitLoss: (c.totalProfitLoss ?? 0) * -1,
      }));

      return {
        eventRows: modified,
        pagination: {
          currentPage: page,
          limit,
          totalItems,
          totalPage: Math.ceil(totalItems / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Event PL report failed: ${error.message}`);
      throw new Error('Internal server error');
    }
  }

  async getCasinoDownlineProfitLoss(
    userId: bigint | number,
    userType: UserType,
    query: CasinoProfitLossReportsRequest,
    isExport?: boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    let ap: number = 0;
    let uplinePath: string | null = '0';
    if (userType === UserType.User) {
      uplinePath = await this.userService.getUplinePathById(userId);
      const user = await this.userService.getPartnership(BigInt(userId));
      if (user) {
        ap = user.partnership;
      }
    }
    if (!uplinePath) throw new Error('User not found');

    try {
      const { downlineUsers, pagination } =
        await this.userService.getDownlineUserWithRoleExceptBanker({
          uplinePath,
          userId: BigInt(userId),
          search: query.searchByUserName,
          level: 1,
          excludeSelfUser: userType === UserType.Admin,
          limit,
          page,
          isExport,
        });

      const users: any[] = [];

      for (const usr of downlineUsers) {
        const plSummary = await this.prisma.$queryRawUnsafe<
          { totalPl: number; uplinePl: number }[]
        >(
          `
        SELECT 
          COALESCE(SUM(bp.total_pl), 0)  AS "totalPl",
          COALESCE(SUM(bp.upline_pl), 0) AS "uplinePl"
        FROM bet_pl bp
        WHERE bp.upline_id = $1
          AND bp.category = 'casino'
          AND ($2::timestamptz IS NULL OR bp.created_at >= $2)
          AND ($3::timestamptz IS NULL OR bp.created_at <= $3)
        `,
          BigInt(usr.id),
          query.fromDate ?? null,
          query.toDate ?? null,
        );
        let profitLoss = Number(plSummary[0]?.totalPl ?? 0);
        const clientPl =
          usr.role === 'USER'
            ? (profitLoss * (100 - ap)) / 100
            : Number(plSummary[0]?.uplinePl ?? 0);
        const partnership = Number(usr.partnership ?? 0);
        const uplinePl =
          usr.role === 'USER'
            ? (profitLoss * ap) / 100
            : (profitLoss * partnership) / 100;

        const downlinePl = usr.role === 'USER' ? 0 : profitLoss - uplinePl;
        profitLoss = profitLoss * -1;
        users.push({
          ...usr,
          profitLoss,
          clientPl,
          uplinePl,
          downlinePl,
        });
      }

      // Totals
      const totals = users.reduce((sum, u) => sum + u.profitLoss, 0);
      const totalClientPl = users.reduce((sum, u) => sum + u.clientPl, 0);
      const totalUplinePl = users.reduce((sum, u) => sum + u.uplinePl, 0);
      const totalDownlinePl = users.reduce((sum, u) => sum + u.downlinePl, 0);

      return {
        downlineUsers: users,
        pagination,
        totals,
        totalClientPl,
        totalUplinePl,
        totalDownlinePl,
      };
    } catch (error) {
      this.logger.error(
        `Error to generate casino downline profit/loss reports. Error: ${error.message}`,
      );
      throw new Error('Internal server error');
    }
  }

  async getMarketProfitLossReport(
    userId: bigint,
    userType: UserType,
    eventId: bigint | number,
    query: MarketProfitLossRequest,
  ) {
    // -----------------------------
    // 1️⃣ Pagination
    // -----------------------------
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    // -----------------------------
    // 2️⃣ Filters (RAW)
    // -----------------------------
    const {
      searchByMarket = null,
      fromDate = null,
      toDate = null,
      sport = null,
      transactionLimit = null,
    } = query;

    // -----------------------------
    // 3️⃣ 🔥 SAFE DATE NORMALIZATION
    // -----------------------------
    const normalizeDate = (val?: string | Date | null) => {
      if (!val) return null;
      const d = val instanceof Date ? val : new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };
    const isAdmin = userType === UserType.Admin;

    const uplineCondition = isAdmin
      ? `bpl.user_type = 'OWNER'`
      : `bpl.upline_id = ${userId}`;

    const fromDateSafe = normalizeDate(query?.fromDate);
    const toDateSafe = normalizeDate(query?.toDate);
    let sportFilter = null;
    if (sport) sportFilter = sport?.toLowerCase();
    if (sport === SportType.HorseRacing) sportFilter = 'horse_racing';

    // -----------------------------
    // 4️⃣ Market-wise PL SQL
    // -----------------------------
    const marketSql = `
    WITH base_bets AS (
      SELECT
        b.id AS bet_id,
        b.market_id,
        b.market_name,
        b.market_type,
        b.selection,
        b.amount,
        e.sport,
        b.placed_at,
bpl.total_pl,
bpl.upline_pl,
(bpl.total_pl - bpl.upline_pl) AS downline_pl,
        ROW_NUMBER() OVER (
          PARTITION BY b.market_id
          ORDER BY b.placed_at DESC
        ) AS rn
      FROM bet b
      JOIN bet_pl bpl ON bpl.bet_id = b.id
      JOIN event e ON e.id = b.event_id
      WHERE
        b.event_id = $1::bigint 
        AND ${uplineCondition}
        AND b.status IN ('won', 'lost')
        AND ($2::text IS NULL OR b.market_name ILIKE '%' || $2 || '%')
        AND ($3::timestamptz IS NULL OR b.placed_at >= $3)
        AND ($4::timestamptz IS NULL OR b.placed_at <= $4)
        AND ($5::sport_type IS NULL OR e.sport = $5::sport_type)
    ),
    limited_bets AS (
      SELECT *
      FROM base_bets
      WHERE $6::int IS NULL OR rn <= $6
    ),
    grouped AS (
      SELECT
        market_id AS "marketId",
        CASE
          WHEN market_type = 'FANCY' THEN selection
          ELSE market_name
        END AS "marketName",
        sport,
        COUNT(*) AS "totalBets",
        SUM(total_pl) AS "totalProfitLoss",
         SUM(upline_pl) AS "uplineProfitLoss",
            SUM(downline_pl) AS "downlineProfitLoss",
        SUM(amount) AS "totalStake",
        MAX(placed_at) AS "lastBetTime"
      FROM limited_bets
      GROUP BY market_id, market_type, market_name, selection, sport
      ORDER BY "lastBetTime" DESC
    )
    SELECT *
    FROM grouped
    OFFSET $7 LIMIT $8;
  `;

    // -----------------------------
    // 5️⃣ Params (ORDER MATTERS)
    // -----------------------------
    const marketParams = [
      eventId, // $1
      searchByMarket, // $2
      fromDateSafe, // $3 ✅ Date | null
      toDateSafe, // $4 ✅ Date | null
      sportFilter, // $5
      transactionLimit, // $6
      skip, // $7
      limit, // $8
    ];

    const markets = await this.prisma.$queryRawUnsafe<
      {
        marketId: string;
        marketName: string;
        sport: string;
        totalBets: number;
        totalProfitLoss: number;
        uplineProfitLoss: number;
        downlineProfitLoss: number;
        totalStake: number;
        lastBetTime: Date;
      }[]
    >(marketSql, ...marketParams);

    // -----------------------------
    // 6️⃣ Count Query
    // -----------------------------
    const countSql = `
    SELECT COUNT(DISTINCT b.market_id) AS total
    FROM bet b
    JOIN bet_pl bpl ON bpl.bet_id = b.id
    JOIN event e ON e.id = b.event_id
    WHERE
      b.event_id = $1::bigint 
        AND ${uplineCondition}
      AND b.status IN ('won', 'lost')
      AND ($2::text IS NULL OR b.market_name ILIKE '%' || $2 || '%')
      AND ($3::timestamptz IS NULL OR b.placed_at >= $3)
      AND ($4::timestamptz IS NULL OR b.placed_at <= $4)
      AND ($5::sport_type IS NULL OR e.sport = $5::sport_type)
  `;

    const countParams = [
      eventId,
      searchByMarket,
      fromDateSafe,
      toDateSafe,
      sportFilter,
    ];

    const countRes = await this.prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...countParams,
    );

    const totalItems = Number(countRes?.[0]?.total ?? 0);

    const groupedMarkets = Object.values(
      markets.reduce(
        (acc, curr) => {
          const key = curr.marketId;

          if (!acc[key]) {
            acc[key] = {
              ...curr,
              totalBets: Number(curr.totalBets),
              totalProfitLoss: Number(curr.totalProfitLoss),
              uplineProfitLoss: Number(curr.uplineProfitLoss),
              downlineProfitLoss: Number(curr.downlineProfitLoss),
              totalStake: Number(curr.totalStake),
              marketName: curr.marketName,
            };
          } else {
            acc[key].totalBets += Number(curr.totalBets);
            acc[key].totalProfitLoss += Number(curr.totalProfitLoss);
            acc[key].totalStake += Number(curr.totalStake);
            acc[key].uplineProfitLoss += Number(curr.uplineProfitLoss);
            acc[key].downlineProfitLoss += Number(curr.downlineProfitLoss);

            if (curr.marketName && acc[key].marketName == null) {
              acc[key].marketName = curr.marketName;
            }

            if (new Date(curr.lastBetTime) > new Date(acc[key].lastBetTime)) {
              acc[key].lastBetTime = curr.lastBetTime;
            }
          }

          return acc;
        },
        {} as Record<string, any>,
      ),
    );

    const modified = groupedMarkets.map((m) => ({
      ...m,
      totalProfitLoss: (m.totalProfitLoss ?? 0) * -1,
    }));

    // -----------------------------
    // 7️⃣ Response
    // -----------------------------
    return {
      markets: modified,
      pagination: {
        currentPage: page,
        limit,
        totalItems,
        totalPage: Math.ceil(totalItems / limit),
      },
    };
  }
}
