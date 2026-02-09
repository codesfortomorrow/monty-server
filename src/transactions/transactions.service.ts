// import ExcelJS from 'exceljs';
import { Injectable } from '@nestjs/common';
import {
  User,
  WalletTransactions,
  WalletTransactionContext,
  WalletTransactionType,
  WalletType,
  ExportType,
  ExportFormat,
  Prisma,
  Wallet,
  Admin,
  ExportStatus,
} from '@prisma/client';
import {
  UserType,
  UtilsService,
  StorageService,
  Pagination,
  DateFilterWithPaginationRequest,
} from '@Common';
// import { ExportFormat } from './dto';
import { WalletTransactionsService } from '../wallet-transactions';
import { PrismaService } from 'src/prisma';
import {
  ExportUserTransactionDto,
  GetTransactionsRequestDto,
  GetUserTransactionsRequestDto,
  RecordType,
  UserGameTransactionRequest,
} from './dto';
import { UsersService } from 'src/users';
import { ExportDepositWithdraw } from './dto/deposit-withdraw.request';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
    private readonly walletTransactionsService: WalletTransactionsService,
    private readonly storageService: StorageService,
    private readonly userService: UsersService,
  ) {}

  //   private generateExcel(
  //     name: string,
  //     columns: Partial<ExcelJS.Column>[],
  //     meta?: {
  //       fromDate?: Date;
  //       toDate?: Date;
  //     },
  //   ) {
  //     const filename = _.compact([
  //       name,
  //       meta?.fromDate && `From_${dayjs(meta.fromDate).format('MMM-DD-YYYY')}`,
  //       meta?.toDate && `Till_${dayjs(meta.toDate).format('MMM-DD-YYYY')}`,
  //       this.utilsService.generateRandomToken(8),
  //     ])
  //       .join('_')
  //       .concat('.xlsx');

  //     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
  //       filename: path.join(this.storageService.diskDestination, filename),
  //       useStyles: true,
  //     });
  //     const worksheet = workbook.addWorksheet();

  //     worksheet.columns = columns;
  //     worksheet.getRow(1).eachCell((cell) => {
  //       cell.font = { bold: true };
  //     });

  //     return { filename, workbook, worksheet };
  //   }

  async getNarration(tx: {
    context: WalletTransactionContext;
    entityId: string | null;
    meta: any;
  }): Promise<string> {
    let narration = '';
    if (
      tx.context === WalletTransactionContext.Deposit ||
      tx.context === WalletTransactionContext.Withdrawal ||
      tx.context === WalletTransactionContext.CryptoWithdrawal ||
      tx.context === WalletTransactionContext.CryptoDeposit ||
      tx.context === WalletTransactionContext.SystemDeposit ||
      tx.context === WalletTransactionContext.SystemWithdrawal ||
      tx.context === WalletTransactionContext.Bonus ||
      tx.context === WalletTransactionContext.BonusSettlement ||
      tx.context === WalletTransactionContext.LossBackBonus ||
      tx.context === WalletTransactionContext.DepositBonus ||
      tx.context === WalletTransactionContext.ReferralBonus ||
      tx.context === WalletTransactionContext.JoiningBonus ||
      tx.context === WalletTransactionContext.ReferralLossCommissionBonus ||
      tx.context === WalletTransactionContext.PointIssue ||
      tx.context === WalletTransactionContext.PointRemove
    ) {
      narration = this.walletTransactionsService.narrationBuilder(tx, {
        context: tx.context,
      });
    } else if (
      tx.context === WalletTransactionContext.Bet ||
      tx.context === WalletTransactionContext.BetRefund ||
      tx.context === WalletTransactionContext.Rollback ||
      tx.context === WalletTransactionContext.Won ||
      tx.context === WalletTransactionContext.Lost ||
      tx.context === WalletTransactionContext.CasinoBet ||
      tx.context === WalletTransactionContext.CasinoWin ||
      tx.context === WalletTransactionContext.CasinoBetRefund
    ) {
      narration = this.walletTransactionsService.narrationBuilder(tx, {
        context: tx.context,
      });
    }
    return narration;
  }

  async getAll(
    userContext: UserType,
    options?: {
      search?: string;
      filters?: {
        userId?: bigint;
        fromDate?: Date;
        toDate?: Date;
        context?: WalletTransactionContext;
        walletType?: WalletType;
        type?: WalletTransactionType;
        recordType?: RecordType;
        adminId?: bigint;
      };
      //   export?: boolean;
      //   exportFormat?: ExportFormat;
      page?: number;
      limit?: number;
      isExport?: boolean;
    },
  ) {
    const filters = options?.filters || {};
    // const exportData = options?.export || false;
    // const exportFormat = options?.exportFormat || ExportFormat.Excel;
    const {
      // count,
      // skip,
      // take,
      pagination,
      data: walletTransactions,
    } = await this.walletTransactionsService.getAll({
      search: options?.search,
      filters: {
        userId: filters.userId,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        context: filters.context,
        walletType: filters.walletType,
        type: filters.type,
        recordType: filters.recordType,
        adminId: filters.adminId,
      },
      page: options?.page,
      limit: options?.limit,
    });

    const response = await this.utilsService.batchable(
      walletTransactions,
      async (walletTransaction) => {
        const tx = {
          ...walletTransaction,
          // narration: await this.getNarration({
          //   context: walletTransaction.context,
          //   entityId: walletTransaction.entityId,
          //   meta: walletTransaction.meta,
          // }),
        };

        if (userContext === UserType.User) {
          return this.utilsService.exclude(tx, ['wallet']);
        } else {
          return tx;
        }
      },
    );

    const bonusContexts = new Set<string>([
      WalletTransactionContext.Bonus,
      WalletTransactionContext.BonusSettlement,
      WalletTransactionContext.JoiningBonus,
      WalletTransactionContext.ReferralBonus,
      WalletTransactionContext.ReferralLossCommissionBonus,
      WalletTransactionContext.LossBackBonus,
      WalletTransactionContext.DepositBonus,
    ]);

    const finalResponse = response.map((item) => {
      if (bonusContexts.has(item.context)) {
        return {
          ...item,
          context: WalletTransactionContext.Bonus, // normalize to bonus
        };
      }

      return item;
    });

    return { data: response, pagination };
    // if (!exportData) {
    //   return { count, skip, take, data: response };
    // } else {
    //   // Export data
    //   if (exportFormat === ExportFormat.Excel) {
    //     const { filename, workbook, worksheet } = await this.generateExcel(
    //       'Transactions',
    //       [
    //         { header: 'Transaction ID	', key: 'id' },
    //         { header: 'MSISDN', key: 'msisdn' },
    //         { header: 'Date & Time', key: 'timestamp' },
    //         { header: 'Narration', key: 'narration' },
    //         { header: 'Amount', key: 'amount' },
    //         { header: 'Balance', key: 'availableBalance' },
    //         { header: 'Type', key: 'type' },
    //       ],
    //       {
    //         fromDate: filters.fromDate,
    //         toDate: filters.toDate,
    //       },
    //     );

    //     response.forEach((row) => {
    //       worksheet
    //         .addRow({
    //           id: row.id.toString(),
    //           msisdn:
    //             'wallet' in row
    //               ? (row.wallet as Wallet & { user: User }).user.mobile
    //               : '',
    //           timestamp: dayjs(row.timestamp)
    //             .tz('EAT')
    //             .format('DD-MM-YYYY HH:mm:ss'),
    //           narration: row.narration,
    //           amount: row.amount.toString(),
    //           availableBalance: row.availableBalance.toString(),
    //           type: row.type,
    //         })
    //         .commit();
    //     });

    //     await workbook.commit();

    //     return { file: this.storageService.getFileUrl(filename) };
    //   }

    //   throw new Error(
    //     `Export format '${exportFormat}' not supported at this moment`,
    //   );
    // }
  }

  async getDepositWithdrawTransactionByUserId(
    userId: bigint | number,
    query: DateFilterWithPaginationRequest,
    isExport?: boolean,
  ) {
    let take: number | undefined;
    let skip: number | undefined;

    if (!isExport && query.page && query.limit) {
      const page = query.page < 1 ? 1 : query.page;
      take = Number(query.limit);
      skip = (Number(page) - 1) * Number(query.limit);
    }

    const where: Prisma.WalletTransactionsWhereInput = {
      wallet: {
        userId,
      },
      context: {
        in: [
          WalletTransactionContext.SystemDeposit,
          WalletTransactionContext.SystemWithdrawal,
          // WalletTransactionContext.PointIssue,
          // WalletTransactionContext.PointRemove,
          WalletTransactionContext.Deposit,
          WalletTransactionContext.Withdrawal,
        ],
      },
    };

    if (query.fromDate || query.toDate) {
      where.timestamp = {
        gte: query.fromDate,
        lte: query.toDate,
      };
    }

    const totalTransactions = await this.prisma.walletTransactions.count({
      where,
    });

    const transactions = await this.prisma.walletTransactions.findMany({
      where,
      orderBy: {
        timestamp: 'desc',
      },
      take,
      skip,
    });

    const totalPage = Math.ceil(
      totalTransactions /
        (query.limit && query.limit > 0
          ? query.limit
          : totalTransactions < 1
            ? 1
            : totalTransactions),
    );

    const pagination: Pagination = {
      currentPage: query.page ?? 1,
      totalPage,
      totalItems: totalTransactions,
      limit: take ?? 10,
    };
    return { transactions, pagination };
  }

  async exportUserTransactionReports(
    userId: bigint,
    userType: UserType,
    query: ExportUserTransactionDto,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.userTransaction,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        timezone: query.timezone,
        name: query.fileName ?? 'Account Statement',
        filters: {
          userType,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
          searchByUserId: query.userId,
          context: query.context,
          recordType: query.recordType,
          type: query.type,
          walletType: query.walletType,
          search: query.search,
        },
      },
    });

    return {
      message: 'Your user transaction export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async getDownlineGameTransactions(
    userId: bigint,
    userType: UserType,
    query: UserGameTransactionRequest,
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
      reportLimit += 'OFFSET $7 LIMIT $8';
    }

    let reportDepthQuery = '';
    if (userRole === 'OWNER') {
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
      reportDepthQuery += `AND nlevel(um.upline) = nlevel(text2ltree($1)) + 1`;
    }

    let contextFilter = '';
    if (query.context) {
      contextFilter = `AND wt.context IN ${this.getDbContext(query.context)}`;
    } else {
      contextFilter = `AND wt.context IN (
                'bet',
                'bet_refund',
                'won',
                'lost',
                'rollback',
                'casino_bet',
                'casino_bet_refund',
                'casino_win'
              )`;
    }

    const sqlQuery = `
          SELECT
            wt.id,
            wt.context,
            wt.type,
            wt.amount,
            wt.narration,
            wt.available_balance AS "availableBalance",
            wt.timestamp,
            wt.entity_id AS "entityId",
            wt.meta,
            wt.status,
            wt.from_account AS "fromAccount",
            wt.to_account AS "toAccount",
            w.user_id AS "userId",
            w.type AS "walletType",
            u.username
          FROM wallet_transactions wt
          JOIN wallets w ON wt.wallet_id = w.id
          JOIN "user" u ON w.user_id = u.id
          JOIN user_meta um ON u.id = um.user_id
          INNER JOIN role r ON r.id = u.role_id
          WHERE r.name = 'USER'
            AND um.upline <@ text2ltree($1)
            ${reportDepthQuery}
            AND ($2::text IS NULL OR u.username ILIKE '%' || $2 || '%')
            AND ($3::timestamptz IS NULL OR wt.timestamp >= $3::timestamptz)
            AND ($4::timestamptz IS NULL OR wt.timestamp <= $4::timestamptz)
            ${contextFilter}
            AND ($5::wallet_type IS NULL OR w.type = $5::wallet_type)
            AND ($6::wallet_transaction_type IS NULL OR wt.type = $6::wallet_transaction_type)
          ORDER BY wt.timestamp DESC
          ${reportLimit}
        `;

    const params: any = [
      uplinePath,
      query.search || null,
      query.fromDate || null,
      query.toDate || null,
      query.walletType?.toLowerCase() || null,
      query.type?.toLowerCase() || null,
    ];

    if (!isExport) {
      params.push(skip);
      params.push(limit);
    }

    const countQuery = `
          SELECT COUNT(*) AS "totalCount"
          FROM wallet_transactions wt
          JOIN wallets w ON wt.wallet_id = w.id
          JOIN "user" u ON w.user_id = u.id
          JOIN user_meta um ON u.id = um.user_id
          INNER JOIN role r ON r.id = u.role_id
          WHERE r.name = 'USER'
            AND um.upline <@ text2ltree($1)
            ${reportDepthQuery}
            AND wt.context IN ('bet', 'bet_refund', 'won', 'lost', 'rollback', 'casino_bet', 'casino_bet_refund', 'casino_win')
            AND ($2::text IS NULL OR u.username ILIKE '%' || $2 || '%')
            AND ($3::timestamptz IS NULL OR wt.timestamp >= $3::timestamptz)
            AND ($4::timestamptz IS NULL OR wt.timestamp <= $4::timestamptz)
            ${contextFilter}
            AND ($5::wallet_type IS NULL OR w.type = $5::wallet_type)
            AND ($6::wallet_transaction_type IS NULL OR wt.type = $6::wallet_transaction_type)
        `;

    const countParams = [
      uplinePath,
      query.search || null,
      query.fromDate || null,
      query.toDate || null,
      query.walletType?.toLowerCase() || null,
      query.type?.toLowerCase() || null,
    ];

    const [transactions, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        {
          id: bigint | number | null;
          context: string;
          type: string;
          amount: number;
          narration: string | null;
          availableBalance: number;
          timestamp: Date;
          entityId: bigint | number | null;
          meta: any;
          status: string;
          fromAccount: bigint | number | null;
          toAccount: bigint | number | null;
          walletType: string | null;
          userId: bigint | number | null;
          username: string;
        }[]
      >(sqlQuery, ...params),
      this.prisma.$queryRawUnsafe<{ totalCount: number | bigint | null }[]>(
        countQuery,
        ...countParams,
      ),
    ]);
    const count = countResult?.[0]?.totalCount
      ? Number(countResult?.[0]?.totalCount)
      : 0;

    const pagination: Pagination = {
      currentPage: page,
      totalPage: Math.ceil(count / limit),
      totalItems: count,
      limit: limit,
    };

    const walletTransactions = transactions.map((t) => ({
      ...t,
      context: this.simplifyContext(t.context),
    }));

    return { transactions: walletTransactions, pagination };
  }

  simplifyContext(context: string) {
    switch (context) {
      case 'won':
      case 'casino_win':
        return 'won';
      case 'lost':
        return 'lost';
      case 'bet':
      case 'casino_bet':
        return 'bet';
      case 'bet_refund':
      case 'casino_bet_refund':
        return 'bet_refund';
      case 'rollback':
        return 'rollback';
      default:
        return context;
    }
  }

  getDbContext(context: WalletTransactionContext) {
    switch (context) {
      case WalletTransactionContext.Won:
        return `('won', 'casino_win')`;
      case WalletTransactionContext.Lost:
        return `('lost')`;
      case WalletTransactionContext.Bet:
        return `('bet', 'casino_bet')`;
      case WalletTransactionContext.BetRefund:
        return `('bet_refund', 'casino_bet_refund')`;
      case WalletTransactionContext.Rollback:
        return `('rollback')`;
      default:
        return `('${context.toLowerCase()}')`;
    }
  }

  async depositWithdraw(
    userId: bigint,
    userType: UserType,
    query: ExportDepositWithdraw,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.transaction,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        timezone: query.timezone,
        name: query.fileName ?? 'Account Statement',
        filters: {
          userType,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
          searchByUserId: query.userId,
        },
      },
    });

    return {
      message:
        'Your user DepositWithdraw export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }

  async gameTransactionReport(
    userId: bigint,
    userType: UserType,
    query: UserGameTransactionRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.gameTransaction,
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        timezone: query.timezone,
        name: query.fileName ?? 'Game Transaction Report',
        filters: {
          userType,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
          search: query.search,
          context: query.context,
          type: query.type,
          walletType: query.walletType,
        },
      },
    });

    return {
      message:
        'Your user Game Transaction export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }
}
