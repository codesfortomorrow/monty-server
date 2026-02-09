import { BaseService, Pagination, UserType } from '@Common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { UsersService } from 'src/users';
import {
  ActiveUserReportRequest,
  DepositeReportRequest,
  IdleUserReportRequest,
  LoginReportRequest,
  SignupReportRequest,
  WithdrawReportRequest,
  ExportReport,
} from './dto';
import { RedisService } from 'src/redis';
import { ReportType } from 'src/reports/dto';
import { ExportFormat, ExportStatus, ExportType } from '@prisma/client';

@Injectable()
export class BussinessReportService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UsersService,
    private readonly redis: RedisService,
  ) {
    super({ loggerDefaultMeta: { service: BussinessReportService.name } });
  }

  async getDepositeReports(
    userId: bigint,
    userType: UserType,
    query: DepositeReportRequest,
    isExport?: boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $6 OFFSET $7';
    }

    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

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

    const sqlQuery = `
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
        t.amount,
        u.username,
        u.id,
        CASE
          WHEN t.id::bigint = fd.first_id::bigint THEN 'First Deposit'
          ELSE 'Refill'
        END AS "subCategory",
        'DEPOSIT' AS category,
        t.timestamp AS "transactionDate"
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
        ${reportDepthQuery}
        AND (
          ($2::text IS NULL) OR
          ($2::text = 'FIRST' AND t.id::bigint = fd.first_id::bigint) OR
          ($2::text = 'REFILL' AND t.id::bigint != fd.first_id::bigint)
        )
        AND ($3::timestamptz IS NULL OR t.timestamp >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR t.timestamp <= $4::timestamptz)
        AND ($5::text IS NULL OR u.username ILIKE '%' || $5 || '%')
        ORDER BY t.timestamp DESC
        ${reportLimit};
    `;

    const params = [
      uplinePath,
      query.category || null,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
      limit,
      skip,
    ];

    const countQuery = `
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

      SELECT count(*) AS count
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
        ${reportDepthQuery}
        AND (
          ($2::text IS NULL) OR
          ($2::text = 'FIRST' AND t.id::bigint = fd.first_id::bigint) OR
          ($2::text = 'REFILL' AND t.id::bigint != fd.first_id::bigint)
        )
        AND ($3::timestamptz IS NULL OR t.timestamp >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR t.timestamp <= $4::timestamptz)
        AND ($5::text IS NULL OR u.username ILIKE '%' || $5 || '%')
    `;

    const countParams = [
      uplinePath,
      query.category || null,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
    ];

    const [deposits, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          amount: number | null;
          username: string | null;
          id: bigint;
          subCategory: string | null;
          category: string | null;
          transactionDate: Date | null;
        }[]
      >(sqlQuery, ...params),
      this.prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
        countQuery,
        ...countParams,
      ),
    ]);

    const count = Number(countResult?.[0].count);

    const userIds = new Set(deposits.map((deposit) => deposit.id));
    const uplineMap = await this.getUplineDetails([...userIds]);

    const mappedDeposits = deposits.map((deposit) => {
      const uplineDetails = uplineMap.get(deposit.id);
      return {
        ...deposit,
        uplineDetails,
      };
    });

    const pagination: Pagination = {
      currentPage: page,
      limit: limit,
      totalItems: count,
      totalPage: Math.ceil(count / limit),
    };

    return { deposits: mappedDeposits, pagination };
  }

  async getWithdrawReports(
    userId: bigint,
    userType: UserType,
    query: WithdrawReportRequest,
    isExport?: boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $6 OFFSET $7';
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

    const sqlQuery = `
      WITH first_withdraws AS (
        SELECT 
          MIN(t.id) AS first_id,
          w.user_id AS user_id
        FROM wallet_transactions t
        JOIN wallets w ON t.wallet_id = w.id
        WHERE 
          (t.context = 'withdrawal' OR t.context = 'system_withdrawal' OR t.context = 'crypto_withdrawal')
          AND t.type = 'debit'
        GROUP BY w.user_id
      )

      SELECT
        t.amount,
        u.username,
        u.id,
        CASE
          WHEN t.id = fd.first_id THEN 'First Withdraw'
          ELSE 'Refill'
        END AS "subCategory",
        'WITHDRAW' AS category,
        t.timestamp AS "transactionDate"
      FROM wallet_transactions t
      INNER JOIN wallets w ON w.id = t.wallet_id
      INNER JOIN "user" u ON u.id = w.user_id
      INNER JOIN role r ON r.id = u.role_id
      INNER JOIN first_withdraws fd ON u.id = fd.user_id
      JOIN user_meta um ON um.user_id = w.user_id
      WHERE t.type = 'debit'
        AND r.name = 'USER'
        AND (t.context = 'withdrawal' OR t.context = 'system_withdrawal' OR t.context = 'crypto_withdrawal')
        AND um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND (
          ($2::text IS NULL) OR
          ($2::text = 'FIRST' AND t.id = fd.first_id) OR
          ($2::text = 'REFILL' AND t.id != fd.first_id)
        )
        AND ($3::timestamptz IS NULL OR t.timestamp >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR t.timestamp <= $4::timestamptz)
        AND ($5::text IS NULL OR u.username ILIKE '%' || $5 || '%')
        ORDER BY t.timestamp DESC
        ${reportLimit};
    `;

    const params = [
      uplinePath,
      query.category || null,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
      limit,
      skip,
    ];

    const countQuery = `
      WITH first_withdraws AS (
        SELECT 
          MIN(t.id) AS first_id,
          w.user_id AS user_id
        FROM wallet_transactions t
        JOIN wallets w ON t.wallet_id = w.id
        WHERE 
          (t.context = 'withdrawal' OR t.context = 'system_withdrawal' OR t.context = 'crypto_withdrawal')
          AND t.type = 'debit'
        GROUP BY w.user_id
      )

      SELECT count(*) AS count
      FROM wallet_transactions t
      INNER JOIN wallets w ON w.id = t.wallet_id
      INNER JOIN "user" u ON u.id = w.user_id
      INNER JOIN first_withdraws fd ON u.id = fd.user_id
      INNER JOIN role r ON r.id = u.role_id
      JOIN user_meta um ON um.user_id = w.user_id
      WHERE t.type = 'debit'
        AND r.name = 'USER'
        AND (t.context = 'withdrawal' OR t.context = 'system_withdrawal' OR t.context = 'crypto_withdrawal')
        AND um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND (
          ($2::text IS NULL) OR
          ($2::text = 'FIRST' AND t.id = fd.first_id) OR
          ($2::text = 'REFILL' AND t.id != fd.first_id)
        )
        AND ($3::timestamptz IS NULL OR t.timestamp >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR t.timestamp <= $4::timestamptz)
        AND ($5::text IS NULL OR u.username ILIKE '%' || $5 || '%')
    `;

    const countParams = [
      uplinePath,
      query.category || null,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
    ];

    const [withdraws, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          amount: number | null;
          username: string | null;
          id: bigint;
          subCategory: string | null;
          category: string | null;
          transactionDate: Date | null;
        }[]
      >(sqlQuery, ...params),
      this.prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
        countQuery,
        ...countParams,
      ),
    ]);

    const count = Number(countResult?.[0].count);

    const userIds = new Set(withdraws.map((withdraw) => withdraw.id));
    const uplineMap = await this.getUplineDetails([...userIds]);

    const mappedWithdraws = withdraws.map((withdraw) => {
      const uplineDetails = uplineMap.get(withdraw.id);
      return {
        ...withdraw,
        uplineDetails,
      };
    });

    const pagination: Pagination = {
      currentPage: page,
      limit: limit,
      totalItems: count,
      totalPage: Math.ceil(count / limit),
    };

    return { withdraws: mappedWithdraws, pagination };
  }

  async getLoginReports(
    userId: bigint,
    userType: UserType,
    query: LoginReportRequest,
    isExport?: Boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $5 OFFSET $6';
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

    const sqlQuery = `
      SELECT 
          u.id AS "userId",
          u.username, 
          r.name AS role, 
          MAX(al.login_at) AS "lastLoginTime"
      FROM activity_log al
      INNER JOIN "user" u ON u.id = al.user_id
      INNER JOIN role r ON r.id = u.role_id
      INNER JOIN user_meta um ON um.user_id = u.id
      WHERE al.login_status = 'success'
        AND um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND ($2::timestamptz IS NULL OR al.login_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR al.login_at <= $3::timestamptz)
        AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
        AND r.name = 'USER'
      GROUP BY u.id, u.username, r.name
      ORDER BY "lastLoginTime" DESC
      ${reportLimit}
    `;

    const params = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
      limit,
      skip,
    ];

    const countQuery = `
    SELECT count(*) FROM  
    (SELECT 
          u.id
      FROM activity_log al
      INNER JOIN "user" u ON u.id = al.user_id
      INNER JOIN role r ON r.id = u.role_id
      INNER JOIN user_meta um ON um.user_id = u.id
      WHERE al.login_status = 'success'
        AND um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND ($2::timestamptz IS NULL OR al.login_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR al.login_at <= $3::timestamptz)
        AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
        AND r.name = 'USER'
      GROUP BY u.id) as login
    `;

    const countParams = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
    ];

    const [logins, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          userId: bigint;
          username: string | null;
          role: string | null;
          lastLoginTime: Date | null;
        }[]
      >(sqlQuery, ...params),
      this.prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
        countQuery,
        ...countParams,
      ),
    ]);

    const count = Number(countResult?.[0].count);

    const userIds = new Set(logins.map((login) => login.userId));
    const uplineMap = await this.getUplineDetails([...userIds]);

    const mappedLogins = logins.map((login) => {
      const uplineDetails = uplineMap.get(login.userId);
      return {
        ...login,
        uplineDetails,
      };
    });

    const pagination: Pagination = {
      currentPage: page,
      limit: limit,
      totalItems: count,
      totalPage: Math.ceil(count / limit),
    };

    return { logins: mappedLogins, pagination };
  }

  async getSignupReports(
    userId: bigint,
    userType: UserType,
    query: SignupReportRequest,
    isExport?: boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $5 OFFSET $6';
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

    const sqlQuery = `
      SELECT 
        u.id,
        u.username, 
        u.created_at AS "createdAt",
        r.name AS role,
        u.mobile
      FROM "user" u
      INNER JOIN role r ON r.id = u.role_id
      INNER JOIN user_meta um ON um.user_id = u.id
      WHERE um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND ($2::timestamptz IS NULL OR u.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR u.created_at <= $3::timestamptz)
        AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
        AND r.name = 'USER'
      ORDER BY u.id DESC
      ${reportLimit}
    `;

    const params = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
      limit,
      skip,
    ];

    const countQuery = `
      SELECT COUNT(*) AS count
      FROM "user" u
      INNER JOIN role r ON r.id = u.role_id
      INNER JOIN user_meta um ON um.user_id = u.id
      WHERE um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND ($2::timestamptz IS NULL OR u.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR u.created_at <= $3::timestamptz)
        AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
        AND r.name = 'USER'
    `;

    const countParams = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
    ];

    const [signups, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          id: bigint;
          username: string | null;
          role: string | null;
          mobile: string | null;
          createdAt: Date | null;
        }[]
      >(sqlQuery, ...params),
      this.prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
        countQuery,
        ...countParams,
      ),
    ]);

    const count = Number(countResult?.[0].count);

    const userIds = new Set(signups.map((signup) => signup.id));
    const uplineMap = await this.getUplineDetails([...userIds]);

    const mappedSignups = signups.map((signup) => {
      const uplineDetails = uplineMap.get(signup.id);
      return {
        ...signup,
        uplineDetails,
      };
    });

    const pagination: Pagination = {
      currentPage: page,
      limit: limit,
      totalItems: count,
      totalPage: Math.ceil(count / limit),
    };

    return { signups: mappedSignups, pagination };
  }

  async getActiveUserReports(
    userId: bigint,
    userType: UserType,
    query: ActiveUserReportRequest,
    isExport?: boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $5 OFFSET $6';
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

    const sqlQuery = `
      SELECT
        u.id,
        u.username,
        r.name AS role,
        MAX(t.timestamp) AS "lastTransactionTime"
      FROM wallet_transactions t
      INNER JOIN wallets w ON w.id = t.wallet_id
      INNER JOIN "user" u ON u.id = w.user_id
      JOIN user_meta um ON um.user_id = w.user_id
      INNER JOIN role r ON r.id = u.role_id
      WHERE um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND r.name = 'USER'
        AND ($2::timestamptz IS NULL OR t.timestamp >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR t.timestamp <= $3::timestamptz)
        AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
      GROUP BY u.id, u.username, r.name
      ORDER BY "lastTransactionTime" DESC
      ${reportLimit};
    `;

    const params = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
      limit,
      skip,
    ];

    const countQuery = `
      SELECT COUNT(*) AS count
      FROM (
        SELECT
          u.id
        FROM wallet_transactions t
        INNER JOIN wallets w ON w.id = t.wallet_id
        INNER JOIN "user" u ON u.id = w.user_id
        JOIN user_meta um ON um.user_id = w.user_id
        INNER JOIN role r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          ${reportDepthQuery}
          AND r.name = 'USER'
          AND ($2::timestamptz IS NULL OR t.timestamp >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR t.timestamp <= $3::timestamptz)
          AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
        GROUP BY u.id
      ) AS active
    `;

    const countParams = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
    ];

    const [activeUsers, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          id: bigint;
          username: string | null;
          role: string | null;
          lastTransactionTime: Date | null;
        }[]
      >(sqlQuery, ...params),
      this.prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
        countQuery,
        ...countParams,
      ),
    ]);

    const count = Number(countResult?.[0].count);

    const userIds = new Set(activeUsers.map((user) => user.id));
    const uplineMap = await this.getUplineDetails([...userIds]);

    const mappedUsers = activeUsers.map((user) => {
      const uplineDetails = uplineMap.get(user.id);
      return {
        ...user,
        uplineDetails,
      };
    });

    const pagination: Pagination = {
      currentPage: page,
      limit: limit,
      totalItems: count,
      totalPage: Math.ceil(count / limit),
    };

    return { activeUsers: mappedUsers, pagination };
  }

  async getIdleUsersReports(
    userId: bigint,
    userType: UserType,
    query: IdleUserReportRequest,
    isExport?: boolean,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    let uplinePath: string | null = '0';
    if (userType === UserType.User)
      uplinePath = await this.userService.getUplinePathById(userId);
    if (!uplinePath) throw new Error('User not found');

    let userRole = 'OWNER';
    if (userType === UserType.User) {
      const role = await this.userService.getRoleByUserId(userId);
      if (role) userRole = role.name;
    }

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $5 OFFSET $6';
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

    const sqlQuery = `
      SELECT 
        u.id,
        u.username,
        u.mobile,
        COALESCE(SUM(t.amount), 0) AS "totalDeposits",
        COALESCE((
          SELECT t3.amount
          FROM wallet_transactions t3
          INNER JOIN wallets w3 ON w3.id = t3.wallet_id
          INNER JOIN "user" u3 ON u3.id = w3.user_id
          WHERE u3.id = u.id AND t3.type = 'credit'
          ORDER BY t3.timestamp DESC
          LIMIT 1
        ), 0) AS last_deposit_amount,
        COALESCE((
          SELECT t3.timestamp
          FROM wallet_transactions t3
          INNER JOIN wallets w3 ON w3.id = t3.wallet_id
          INNER JOIN "user" u3 ON u3.id = w3.user_id
          WHERE u3.id = u.id AND t3.type = 'credit'
          ORDER BY t3.timestamp DESC
          LIMIT 1
        ), NULL) AS last_deposit_date
      FROM "user" u
      INNER JOIN user_meta um ON um.user_id = u.id
      INNER JOIN wallets w ON w.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      LEFT JOIN wallet_transactions t ON w.id = t.wallet_id AND t.type = 'credit'
      WHERE r.name = 'USER'
        AND um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND u.id NOT IN (
          SELECT DISTINCT u2.id
          FROM wallet_transactions t2
          INNER JOIN wallets w2 ON w2.id = t2.wallet_id
          INNER JOIN "user" u2 ON u2.id = w2.user_id
          JOIN user_meta um2 ON um2.user_id = w2.user_id
          WHERE um2.upline <@ text2ltree($1::text)
          AND ($2::timestamptz IS NULL OR t2.timestamp >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR t2.timestamp <= $3::timestamptz)
        )
        AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
      GROUP BY u.id
      ORDER BY last_deposit_date DESC NULLS LAST
      ${reportLimit};
    `;

    const params = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
      limit,
      skip,
    ];

    const countQuery = `
      SELECT COUNT(*) AS count
      FROM "user" u
      INNER JOIN user_meta um ON um.user_id = u.id
      INNER JOIN role r ON r.id = u.role_id
      WHERE r.name = 'USER'
        AND um.upline <@ text2ltree($1::text)
        ${reportDepthQuery}
        AND u.id NOT IN (
          SELECT DISTINCT u2.id
          FROM wallet_transactions t
          INNER JOIN wallets w ON w.id = t.wallet_id
          INNER JOIN "user" u2 ON u2.id = w.user_id
          JOIN user_meta um2 ON um2.user_id = w.user_id
          WHERE um2.upline <@ text2ltree($1::text)
          ${reportDepthQuery}
          AND ($2::timestamptz IS NULL OR u2.created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR u2.created_at <= $3::timestamptz)
        )
        AND ($4::text IS NULL OR u.username ILIKE '%' || $4 || '%')
    `;

    const countParams = [
      uplinePath,
      query.fromDate || null,
      query.toDate || null,
      query.search || null,
    ];

    const [idleUsers, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          id: bigint;
          username: string | null;
          role: string | null;
          lastTransactionTime: Date | null;
        }[]
      >(sqlQuery, ...params),
      this.prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
        countQuery,
        ...countParams,
      ),
    ]);

    const count = Number(countResult?.[0].count);

    const userIds = new Set(idleUsers.map((user) => user.id));
    const uplineMap = await this.getUplineDetails([...userIds]);

    const mappedUsers = idleUsers.map((user) => {
      const uplineDetails = uplineMap.get(user.id);
      return {
        ...user,
        uplineDetails,
      };
    });

    const pagination: Pagination = {
      currentPage: page,
      limit: limit,
      totalItems: count,
      totalPage: Math.ceil(count / limit),
    };

    return { idleUsers: mappedUsers, pagination };
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

  async exportDepositReports(
    userId: bigint,
    userType: UserType,
    query: DepositeReportRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.depositReport,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Deposit',
        filters: {
          userType,
          category: query.category,
          search: query.search,
          reportType: query.reportType,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message: 'Your deposit report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportWithdrawalReports(
    userId: bigint,
    userType: UserType,
    query: WithdrawReportRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.withdrawReport,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Withdrawal',
        filters: {
          userType,
          category: query.category,
          search: query.search,
          reportType: query.reportType,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message: 'Your withdrawal report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportLoginReports(
    userId: bigint,
    userType: UserType,
    query: LoginReportRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.loginReport,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Logins',
        filters: {
          userType,
          reportType: query.reportType,
          search: query.search,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message: 'Your login report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportSignupReports(
    userId: bigint,
    userType: UserType,
    query: SignupReportRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.signupReport,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Signups',
        filters: {
          userType,
          reportType: query.reportType,
          search: query.search,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });
    return {
      message: 'Your signup report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportActiveUsersReports(
    userId: bigint,
    userType: UserType,
    query: ActiveUserReportRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.activeUsersReport, // ensure enum exists
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Active Users',
        filters: {
          userType,
          reportType: query.reportType,
          search: query.search,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message:
        'Your active users report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async exportIdleUsersReports(
    userId: bigint,
    userType: UserType,
    query: IdleUserReportRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.idleUsersReport, // ensure enum exists
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'Idle Users',
        filters: {
          userType,
          reportType: query.reportType,
          search: query.search,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
        },
      },
    });

    return {
      message: 'Your idle users report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }
}
