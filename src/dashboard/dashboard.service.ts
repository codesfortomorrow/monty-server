import {
  BaseService,
  DateFilterRequest,
  UserType,
  UtilsService,
} from '@Common';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { UsersService } from 'src/users';
import {
  GameAnalyticsRequest,
  LiveGamesRequest,
  TopUserCategory,
  TopUserRequest,
} from './dto';
import { WalletsService } from 'src/wallets/wallets.service';
import { MarketType, SportType } from '@prisma/client';
import { OddsService } from 'src/odds/odds.service';
import { ConfigType } from '@nestjs/config';
import { casinoConfigFactory } from '@Config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DashboardService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UsersService,
    private readonly walletService: WalletsService,
    private readonly oddsService: OddsService,
    private readonly utils: UtilsService,
    private readonly http: HttpService,
    @Inject(casinoConfigFactory.KEY)
    private readonly casinoConfig: ConfigType<typeof casinoConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: DashboardService.name } });
  }

  async getUserManagement(
    userId: bigint,
    userType: UserType,
    query: DateFilterRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const userCounQuery = `
        SELECT
        COUNT(CASE WHEN r.name = 'SUPER ADMIN' THEN 1 END) AS "superAdmin",
        COUNT(CASE WHEN r.name = 'ADMIN' THEN 1 END) AS "admin",
        COUNT(CASE WHEN r.name = 'SUPER MASTER' THEN 1 END) AS "superMaster",
        COUNT(CASE WHEN r.name = 'MASTER' THEN 1 END) AS "master",
        COUNT(CASE WHEN r.name = 'USER' THEN 1 END) AS "user",
        COUNT(CASE WHEN r.name = 'RESULT MANAGER' THEN 1 END) AS "resultManager"
        FROM "user" u
        JOIN role r ON r.id = u.role_id
        JOIN user_meta um ON um.user_id = u.id
        WHERE um.upline <@ text2ltree($1::text)
    `;

    const userCount = await this.prisma.$queryRawUnsafe<
      {
        resultManager: number | bigint | null;
        admin: number | bigint | null;
        superAdmin: number | bigint | null;
        superMaster: number | bigint | null;
        master: number | bigint | null;
        user: number | bigint | null;
      }[]
    >(userCounQuery, uplinePath);

    const newUserQuery = `
      SELECT COUNT(*) AS "newUser"
      FROM "user" u
      INNER JOIN role r ON r.id = u.role_id
      INNER JOIN user_meta um ON um.user_id = u.id
      WHERE um.upline <@ text2ltree($1::text)
        AND ($2::timestamptz IS NULL OR u.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR u.created_at <= $3::timestamptz)
        AND r.name = 'USER'
    `;
    const newuserCount = await this.prisma.$queryRawUnsafe<
      {
        newUser: number | bigint | null;
      }[]
    >(newUserQuery, uplinePath, query.fromDate || null, query.toDate || null);

    const activeUserQuery = `
      SELECT COUNT(*) AS "activeUser"
      FROM (
        SELECT
          u.id
        FROM wallet_transactions t
        INNER JOIN wallets w ON w.id = t.wallet_id
        INNER JOIN "user" u ON u.id = w.user_id
        JOIN user_meta um ON um.user_id = w.user_id
        INNER JOIN role r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          AND r.name = 'USER'
          AND ($2::timestamptz IS NULL OR t.timestamp >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR t.timestamp <= $3::timestamptz)
        GROUP BY u.id
      ) AS active
    `;

    const activeUserCount = await this.prisma.$queryRawUnsafe<
      {
        activeUser: bigint | number | null;
      }[]
    >(
      activeUserQuery,
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
    );

    const idleUsersQuery = `
        SELECT COUNT(*) AS "idleUser"
        FROM "user" u
        INNER JOIN user_meta um ON um.user_id = u.id
        INNER JOIN role r ON r.id = u.role_id
        WHERE r.name = 'USER'
            AND um.upline <@ text2ltree($1::text)
            AND u.id NOT IN (
                SELECT DISTINCT u2.id
                FROM wallet_transactions t
                INNER JOIN wallets w ON w.id = t.wallet_id
                INNER JOIN "user" u2 ON u2.id = w.user_id
                JOIN user_meta um2 ON um2.user_id = w.user_id
                WHERE um2.upline <@ text2ltree($1::text)
                AND ($2::timestamptz IS NULL OR u2.created_at >= $2::timestamptz)
                AND ($3::timestamptz IS NULL OR u2.created_at <= $3::timestamptz)
            )
    `;

    const idleUsersCount = await this.prisma.$queryRawUnsafe<
      {
        idleUser: bigint | number | null;
      }[]
    >(idleUsersQuery, uplinePath, query.fromDate || null, query.toDate || null);

    const affiliateCountQuery = `
      SELECT
        COUNT(*) AS "affiliate"
      FROM affiliate a
      JOIN "user" u ON u.id = a.user_id
      JOIN user_meta um ON um.user_id = u.id
      JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND a.request_status = 'approved'
        AND ($2::timestamptz IS NULL OR a.accepting_date >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR a.accepting_date <= $3::timestamptz)
    `;

    const affiliateCount = await this.prisma.$queryRawUnsafe<
      {
        affiliate: bigint | number | null;
      }[]
    >(
      affiliateCountQuery,
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
    );

    return {
      user: Number(userCount?.[0]?.user || 0),
      resultManager: Number(userCount?.[0]?.resultManager || 0),
      admin: Number(userCount?.[0]?.admin || 0),
      superAdmin: Number(userCount?.[0]?.superAdmin || 0),
      superMaster: Number(userCount?.[0]?.superMaster || 0),
      master: Number(userCount?.[0]?.master || 0),
      newUser: Number(newuserCount?.[0]?.newUser || 0),
      activeUser: Number(activeUserCount?.[0]?.activeUser || 0),
      idleUser: Number(idleUsersCount?.[0]?.idleUser || 0),
      affiliate: Number(affiliateCount?.[0]?.affiliate || 0),
    };
  }

  async getGameAnalytics(
    userId: bigint,
    userType: UserType,
    query: GameAnalyticsRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    let sportFilter = null;
    if (query.sport) {
      sportFilter = query.sport?.toLowerCase();
      if (query.sport === SportType.HorseRacing) {
        sportFilter = 'horse_racing';
      }
    }

    const gameQuery = `
      SELECT
        COUNT(*) AS "betCount",
        SUM(b.amount) AS "stake",
        COUNT(CASE WHEN b.status = 'pending' THEN 1 END) AS "unsettleBet",
        COUNT(CASE WHEN b.status = 'won' OR b.status = 'lost' THEN 1 END) AS "settleBet",
        SUM(b.payout) AS "profitLoss"
      FROM bet b
      JOIN "user" u ON u.id = b.user_id
      JOIN user_meta um ON  um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR b.placed_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR b.placed_at <= $3::timestamptz)
        AND ($4::sport_type IS NULL OR b.sport = $4::sport_type) 
    `;

    const gameCount = await this.prisma.$queryRawUnsafe<
      {
        betCount: bigint | number | null;
        stake: number | null;
        unsettleBet: bigint | number | null;
        settleBet: bigint | number | null;
        profitLoss: number | null;
      }[]
    >(
      gameQuery,
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      sportFilter,
    );

    return {
      betCount: Number(gameCount?.[0]?.betCount || 0),
      stake: Number(gameCount?.[0]?.stake || 0),
      unsettleBet: Number(gameCount?.[0]?.unsettleBet || 0),
      settleBet: Number(gameCount?.[0]?.settleBet || 0),
      profitLoss: Number(gameCount?.[0]?.profitLoss || 0),
      platformProfitLoss: Number(gameCount?.[0]?.profitLoss || 0) * -1,
    };
  }

  async getCasinoAnalytics(
    userId: bigint,
    userType: UserType,
    query: DateFilterRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const gameQuery = `
      SELECT
        COUNT(*) AS "betCount",
        SUM(b.total_bets) AS "stake",
        SUM(b.total_wins - b.total_bets) AS "profitLoss"
      FROM casino_round_histories b
      JOIN "user" u ON u.id = b.user_id
      JOIN user_meta um ON  um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR b.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR b.created_at <= $3::timestamptz)
    `;

    const gameCount = await this.prisma.$queryRawUnsafe<
      {
        betCount: bigint | number | null;
        stake: number | null;
        profitLoss: number | null;
      }[]
    >(gameQuery, uplinePath, query.fromDate || null, query.toDate || null);

    const rollbackQuery = `
      SELECT
        COALESCE(SUM(t.amount), 0) AS "rollbackAmount"
      FROM casino_transaction t
      JOIN "user" u ON u.id = t.user_id
      JOIN user_meta um ON  um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND t.is_rolled_back = true
        AND ($2::timestamptz IS NULL OR t.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR t.created_at <= $3::timestamptz)
    `;

    const rollbackAmount = await this.prisma.$queryRawUnsafe<
      { rollbackAmount: number | null }[]
    >(rollbackQuery, uplinePath, query.fromDate || null, query.toDate || null);

    let assignedCredit = 0;
    let remainingCredit = 0;

    const url = `${this.casinoConfig.gapBaseUrl}/gap-casino/total-summary?platformId=${this.casinoConfig.operatorId}&t=${Date.now()}`;
    console.log('url', url);
    try {
      const response = await this.utils.rerunnable(async () => {
        const res = await firstValueFrom(this.http.get(url));
        return res.data;
      }, 3);

      assignedCredit = Number(response?.data?.[0]?.assignedCredit || 0);
      remainingCredit = Number(response?.data?.[0]?.casinoRemainingPoints || 0);
    } catch (error) {
      this.logger.error(`Error fetching casino credit information: ${error}`);
    }

    return {
      betCount: Number(gameCount?.[0]?.betCount || 0),
      stake: Number(gameCount?.[0]?.stake || 0),
      rollbackAmount: Number(rollbackAmount?.[0]?.rollbackAmount || 0),
      profitLoss: Number(gameCount?.[0]?.profitLoss || 0),
      platformProfitLoss: Number(gameCount?.[0]?.profitLoss || 0) * -1,
      assignedCredit,
      remainingCredit,
    };
  }

  async getBusinessAnalytics(
    userId: bigint,
    userType: UserType,
    query: DateFilterRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const transactionQuery = `
      SELECT
        SUM(CASE WHEN t.context IN ('deposit', 'system_deposit', 'crypto_deposit') THEN t.amount ELSE 0 END) AS "totalDeposits",
        SUM(CASE WHEN t.context IN ('withdrawal', 'system_withdrawal', 'crypto_withdrawal') THEN t.amount ELSE 0 END) AS "totalWithdraws",
        COUNT(DISTINCT CASE WHEN t.context IN ('withdrawal', 'system_withdrawal', 'crypto_withdrawal') THEN t.wallet_id ELSE NULL END) AS "totalWithdrawsUsers"
      FROM wallet_transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN "user" u ON u.id = w.user_id
      JOIN user_meta um ON  um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR t.timestamp >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR t.timestamp <= $3::timestamptz)
    `;

    const transactionParams = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
    ];

    const dipositBreakdownQuery = `
      WITH first_deposits AS (
        SELECT 
          MIN(t.id)::bigint AS first_id,
          w.user_id::bigint AS user_id
        FROM wallet_transactions t
        JOIN wallets w ON t.wallet_id = w.id
        WHERE 
          (t.context = 'deposit' OR t.context = 'system_deposit' OR t.context = 'crypto_deposit')
          AND t.type = 'credit'
        GROUP BY w.user_id
      )

      SELECT
        SUM(CASE
          WHEN t.id::bigint = fd.first_id::bigint THEN t.amount
          ELSE 0
        END) AS "firstDepositAmount",
        COUNT(DISTINCT CASE WHEN t.id = fd.first_id THEN t.wallet_id ELSE NULL END) AS "firstDepositsUsers",

        SUM(CASE
          WHEN t.id::bigint != fd.first_id::bigint THEN t.amount
          ELSE 0
        END) AS "refillDepositAmount",
        COUNT(DISTINCT CASE WHEN t.id != fd.first_id THEN t.wallet_id ELSE NULL END) AS "refillDepositsUsers"
      FROM wallet_transactions t
      INNER JOIN wallets w ON w.id = t.wallet_id
      INNER JOIN "user" u ON u.id = w.user_id
      INNER JOIN role r ON r.id = u.role_id
      INNER JOIN first_deposits fd ON u.id = fd.user_id::bigint
      JOIN user_meta um ON um.user_id = w.user_id
      WHERE t.type = 'credit'
        AND r.name = 'USER'
        AND (t.context = 'deposit' OR t.context = 'system_deposit' OR t.context = 'crypto_deposit')
        AND um.upline <@ text2ltree($1::text)
        AND ($2::timestamptz IS NULL OR t.timestamp >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR t.timestamp <= $3::timestamptz)
    `;

    const depositBreakdownParams = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
    ];

    const [transactionCount, depositBreakdown] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          totalDeposits: number | null;
          totalWithdraws: number | null;
          totalWithdrawsUsers: bigint | number | null;
        }[]
      >(transactionQuery, ...transactionParams),

      this.prisma.$queryRawUnsafe<
        {
          firstDepositAmount: number | null;
          firstDepositsUsers: bigint | number | null;
          refillDepositAmount: number | null;
          refillDepositsUsers: bigint | number | null;
        }[]
      >(dipositBreakdownQuery, ...depositBreakdownParams),
    ]);

    return {
      totalDeposits: Number(transactionCount?.[0]?.totalDeposits || 0),
      totalWithdraws: Number(transactionCount?.[0]?.totalWithdraws || 0),
      totalWithdrawsUsers: Number(
        transactionCount?.[0]?.totalWithdrawsUsers || 0,
      ),
      firstDepositAmount: Number(
        depositBreakdown?.[0]?.firstDepositAmount || 0,
      ),
      firstDepositsUsers: Number(
        depositBreakdown?.[0]?.firstDepositsUsers || 0,
      ),
      refillDepositAmount: Number(
        depositBreakdown?.[0]?.refillDepositAmount || 0,
      ),
      refillDepositsUsers: Number(
        depositBreakdown?.[0]?.refillDepositsUsers || 0,
      ),
    };
  }

  async getTopUsers(userId: bigint, userType: UserType, query: TopUserRequest) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    let sqlQuery = '';
    if (query.category === TopUserCategory.CASINO) {
      sqlQuery = `
        SELECT
          u.id AS "userId",
          u.username AS "username",
          COUNT(crh.id) AS "totalBets",
          COALESCE(SUM(crh.total_wins - crh.total_bets), 0) AS "profitLoss"
        FROM casino_round_histories crh
        JOIN "user" u ON u.id = crh.user_id
        JOIN user_meta um ON  um.user_id = u.id
        INNER JOIN role r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          AND r.name = 'USER'
          AND ($2::timestamptz IS NULL OR crh.created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR crh.created_at <= $3::timestamptz)
        GROUP BY u.id, u.username
        ORDER BY "profitLoss" DESC
        LIMIT 5
      `;
    } else {
      sqlQuery = `
        SELECT
          u.id AS "userId",
          u.username AS "username",
          COUNT(b.id) AS "totalBets",
          COALESCE(SUM(b.payout), 0) AS "profitLoss"
        FROM bet b
        JOIN "user" u ON u.id = b.user_id
        JOIN user_meta um ON  um.user_id = u.id
        INNER JOIN role r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          AND r.name = 'USER'
          AND ($2::timestamptz IS NULL OR b.placed_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR b.placed_at <= $3::timestamptz)
        GROUP BY u.id, u.username
        ORDER BY "profitLoss" DESC
        LIMIT 5
      `;
    }

    const params = [uplinePath, query.fromDate || null, query.toDate || null];

    const topUsers = await this.prisma.$queryRawUnsafe<
      {
        userId: bigint | number | null;
        username: string | null;
        totalBets: bigint | number | null;
        profitLoss: number | null;
      }[]
    >(sqlQuery, ...params);

    return topUsers;
  }

  async getTopCategories(
    userId: bigint,
    userType: UserType,
    query: DateFilterRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const sportsQuery = `
      SELECT
        b.sport AS "category",
        COUNT(DISTINCT b.event_id) AS "matchCount",
        COUNT(b.id) AS "totalBets",
        COALESCE(SUM(b.payout), 0)AS "profitLoss"
      FROM bet b
      JOIN "user" u ON u.id = b.user_id
      JOIN user_meta um ON  um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR b.placed_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR b.placed_at <= $3::timestamptz)
      GROUP BY b.sport
      ORDER BY "profitLoss" DESC
    `;

    const casinoQuery = `
      SELECT
        'casino' AS "category",
        NULL AS "matchCount",
        COUNT(crh.id) AS "totalBets",
        COALESCE(SUM(crh.total_wins - crh.total_bets), 0) AS "profitLoss"
      FROM casino_round_histories crh
      JOIN "user" u ON u.id = crh.user_id
      JOIN user_meta um ON  um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR crh.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR crh.created_at <= $3::timestamptz)
      ORDER BY "profitLoss" DESC
    `;

    const params = [uplinePath, query.fromDate || null, query.toDate || null];

    const [sportsCategories, casinoCategories] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          category: string | null;
          matchCount: bigint | number | null;
          totalBets: bigint | number | null;
          profitLoss: number | null;
        }[]
      >(sportsQuery, ...params),

      this.prisma.$queryRawUnsafe<
        {
          category: string | null;
          matchCount: bigint | number | null;
          totalBets: bigint | number | null;
          profitLoss: number | null;
        }[]
      >(casinoQuery, ...params),
    ]);

    const categories = [...sportsCategories, ...casinoCategories];

    return categories.map((category) => ({
      ...category,
      profitLoss: Number(category.profitLoss || 0) * -1,
    }));
  }

  async getDeviceBreakdown(
    userId: bigint,
    userType: UserType,
    query: DateFilterRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const deviceQuery = `
      SELECT
        a.device AS "device",
        COUNT(a.id) AS "count"
      FROM activity_log a
      JOIN "user" u ON u.id = a.user_id
      JOIN user_meta um ON  um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR a.login_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR a.login_at <= $3::timestamptz)
      GROUP BY a.device
    `;

    const params = [uplinePath, query.fromDate || null, query.toDate || null];

    const deviceBreakdown = await this.prisma.$queryRawUnsafe<
      {
        device: string | null;
        count: bigint | number | null;
      }[]
    >(deviceQuery, ...params);

    return deviceBreakdown;
  }

  async getBonusAnalytics(
    userId: bigint,
    userType: UserType,
    query: DateFilterRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const bonusApplicantQuery = `
      SELECT
        COALESCE(SUM(ba.bonus_amount), 0) AS "totalBonusAmount",
        COUNT(DISTINCT ba.user_id) AS "uniqueApplicants"
      FROM bonus_applicant ba
      JOIN "user" u ON u.id = ba.user_id
      JOIN user_meta um ON um.user_id = u.id
      JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR ba.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR ba.created_at <= $3::timestamptz)
    `;

    const params = [uplinePath, query.fromDate || null, query.toDate || null];

    const bonusQuery = `
      SELECT
        COUNT(*) AS "activeBonusCount"
      FROM bonus b
      WHERE b.status = 'active'
    `;

    const [bonusApplicant, activeBonusCount] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          totalBonusAmount: number | null;
          uniqueApplicants: bigint | number | null;
        }[]
      >(bonusApplicantQuery, ...params),

      this.prisma.$queryRawUnsafe<
        {
          activeBonusCount: bigint | number | null;
        }[]
      >(bonusQuery),
    ]);

    return {
      totalBonusAmount: Number(bonusApplicant?.[0]?.totalBonusAmount || 0),
      uniqueApplicants: Number(bonusApplicant?.[0]?.uniqueApplicants || 0),
      activeBonusCount: Number(activeBonusCount?.[0]?.activeBonusCount || 0),
    };
  }

  async getLoginSummary(
    userId: bigint,
    userType: UserType,
    query: DateFilterRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const loginQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN r.name = 'WHITELABEL' THEN u.id END) AS "whitelabel",
        COUNT(DISTINCT CASE WHEN r.name = 'ADMIN' THEN u.id END) AS "admin",
        COUNT(DISTINCT CASE WHEN r.name = 'SUB ADMIN' THEN u.id END) AS "subAdmin",
        COUNT(DISTINCT CASE WHEN r.name = 'SUPER MASTER' THEN u.id END) AS "superMaster",
        COUNT(DISTINCT CASE WHEN r.name = 'MASTER' THEN u.id END) AS "master",
        COUNT(DISTINCT CASE WHEN r.name = 'USER' THEN u.id END) AS "user"
      FROM activity_log a
      JOIN "user" u ON u.id = a.user_id
      JOIN role r ON r.id = u.role_id
      JOIN user_meta um ON um.user_id = u.id
      WHERE um.upline <@ text2ltree($1::text)
        AND ($2::timestamptz IS NULL OR a.login_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR a.login_at <= $3::timestamptz)
        AND a.login_status = 'success';
    `;

    const affiliateLoginQuery = `
      SELECT
        COUNT(DISTINCT u.id) AS "affiliate"
      from activity_log a
      JOIN affiliate af ON af.user_id = a.user_id
      JOIN "user" u ON u.id = a.user_id
      JOIN user_meta um ON um.user_id = u.id
      WHERE um.upline <@ text2ltree($1::text)
        AND ($2::timestamptz IS NULL OR a.login_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR a.login_at <= $3::timestamptz)
        AND a.login_status = 'success'
        AND af.request_status = 'approved';
    `;

    const params = [uplinePath, query.fromDate || null, query.toDate || null];

    const [loginSummary, affiliateLoginSummary] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          whitelabel: bigint | number | null;
          admin: bigint | number | null;
          subAdmin: bigint | number | null;
          superMaster: bigint | number | null;
          master: bigint | number | null;
          user: bigint | number | null;
        }[]
      >(loginQuery, ...params),
      this.prisma.$queryRawUnsafe<
        {
          affiliate: bigint | number | null;
        }[]
      >(affiliateLoginQuery, ...params),
    ]);

    return {
      whitelabel: Number(loginSummary?.[0]?.whitelabel || 0),
      admin: Number(loginSummary?.[0]?.admin || 0),
      subAdmin: Number(loginSummary?.[0]?.subAdmin || 0),
      superMaster: Number(loginSummary?.[0]?.superMaster || 0),
      master: Number(loginSummary?.[0]?.master || 0),
      user: Number(loginSummary?.[0]?.user || 0),
      affiliate: Number(affiliateLoginSummary?.[0]?.affiliate || 0),
    };
  }

  async getBalanceSummary(userId: bigint, userType: UserType) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const balanceQuery = `
       WITH downline AS (
          SELECT w.amount, w.exposure_amount, r.name AS role
          FROM wallets w
          JOIN user_meta um ON um.user_id = w.user_id
          JOIN "user" u ON u.id = w.user_id
          JOIN role r ON r.id = u.role_id
          WHERE w.type = 'main'
            AND um.upline <@ text2ltree($1::text)
            AND um.user_id != $2::bigint
            AND r.name != 'DEMO'
        )
        SELECT
          COALESCE((SELECT SUM(amount) FROM downline), 0) AS total_downline_balance,
          COALESCE((SELECT amount FROM wallets WHERE user_id = $2::bigint AND type='main'), 0) AS user_balance,
          COALESCE((SELECT SUM(amount) FROM downline WHERE role = 'USER'), 0) AS player_balance,
          COALESCE((SELECT SUM(exposure_amount) FROM downline WHERE role = 'USER'), 0) AS player_exposure
    `;

    let ownnerBalance = 0;
    if (userType === UserType.Admin) {
      const wallet = await this.walletService.getByAdminId(userId);
      ownnerBalance = Number(wallet.amount);
    }

    const balanceSummary = await this.prisma.$queryRawUnsafe<
      {
        total_downline_balance: bigint | number | null;
        user_balance: bigint | number | null;
        player_balance: bigint | number | null;
        player_exposure: bigint | number | null;
      }[]
    >(balanceQuery, uplinePath, userId);

    const availableBalance =
      userType === UserType.Admin
        ? ownnerBalance
        : Number(balanceSummary?.[0]?.user_balance || 0);
    const totalDownlineBalance = Number(
      balanceSummary?.[0]?.total_downline_balance || 0,
    );
    return {
      totalDownlineBalance,
      availableBalance,
      playerBalance: Number(balanceSummary?.[0]?.player_balance || 0),
      playerExposure: Number(balanceSummary?.[0]?.player_exposure || 0),
      totalBalance: availableBalance + totalDownlineBalance,
    };
  }

  async getLiveGames(
    userId: bigint,
    userType: UserType,
    query: LiveGamesRequest,
  ) {
    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    const liveGameQuery = `
      SELECT
        e.id
      FROM event e
      JOIN bet b ON b.event_id = e.id
      JOIN "user" u ON u.id = b.user_id
      JOIN user_meta um ON um.user_id = u.id
      JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        AND r.name = 'USER'
        AND e.inplay = true
        AND e.status IN ('active', 'upcoming', 'live', 'open')
        AND e.sport IN ('cricket', 'tennis', 'soccer')
      GROUP BY e.id
    `;

    const liveGames = await this.prisma.$queryRawUnsafe<
      {
        id: bigint | number | null;
      }[]
    >(liveGameQuery, uplinePath);

    const liveGameIds = liveGames
      .map((game) => game.id)
      .filter((id) => id !== null) as bigint[];

    const events = await this.prisma.event.findMany({
      where: {
        id: { in: liveGameIds },
        sport: query.sport,
        startTime: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        name: true,
        externalId: true,
        sport: true,
        status: true,
        startTime: true,
        inplay: true,
        isFancy: true,
        isBookmaker: true,
        isPremiumFancy: true,
        isPopular: true,
        competitionId: true,
        providerId: true,

        competition: {
          select: {
            id: true,
            name: true,
            externalId: true,
            startDate: true,
          },
        },

        markets: {
          where: {
            NOT: { type: MarketType.Premium },
          },
          select: {
            id: true,
            name: true,
            externalId: true,
            runner: true,
          },
        },
      },
    });

    const enriched = await this.oddsService.mapEventsWithMatchOdds(events);
    for (const event of enriched) {
      const exposureQuery = `
        SELECT
          COALESCE(SUM(ex.amount), 0) AS "totalExposure",
          ex.selection_id AS "selectionId"
        FROM exposure ex
        JOIN "user" u ON u.id = ex.user_id
        JOIN user_meta um ON um.user_id = u.id
        JOIN role r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          AND r.name = 'USER'
          AND ex.event_id = $2::bigint
          AND ex.status = 'active'
          AND ex.market_external_id = $3::text
        GROUP BY ex.event_id, ex.market_external_id, ex.selection_id
      `;

      const exposures = await this.prisma.$queryRawUnsafe<
        {
          totalExposure: number | null;
          selectionId: string | null;
        }[]
      >(exposureQuery, uplinePath, event.id, event.marketExternalId);

      event.exposures = exposures;
    }

    return enriched;
  }
}
