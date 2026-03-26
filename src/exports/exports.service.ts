import os from 'os';
import {
  BaseService,
  Pagination,
  StorageService,
  UserType,
  UtilsService,
} from '@Common';
import * as path from 'path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import {
  BetStatusType,
  ExportFormat,
  ExportStatus,
  ExportType,
  Prisma,
  WalletTransactionType,
  PaymentMode,
} from '@prisma/client';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import * as fastcsv from 'fast-csv';
import PDFDocument, { undash } from 'pdfkit';
import { CasinoService } from 'src/casino/casino.service';
import { WalletTransactionsService } from 'src/wallet-transactions';
import { TransactionsService } from 'src/transactions/transactions.service';
import { BankerService } from 'src/banker/banker.service';
import {
  ActivityLogReportParams,
  BetHistoryReportParams,
  CasinoBetHistoryReportParams,
  CasinoDownlineProfitLossReportParams,
  CasinoPlayerProfitLossReportParams,
  DepositWithdrawExportParams,
  DownlineProfitLossReportParams,
  EventProfitLossReportParams,
  ExportAffiliateCommissionParams,
  ExportAffiliateListParams,
  ExportBonusStatementParams,
  ExportUserGameTransactionParams,
  ExportUserTransactionParams,
  InactiveUserReportParams,
  PlayerProfitLossReportParams,
  ReportParams,
  UserTransactionReportParams,
} from './export.interface';
import { GetDepositWithdrawQueryDto } from 'src/banker/dto';
import { getExportReportDto } from './dto';
import { ReportsService } from 'src/reports/reports.service';
import { CasinoHistoryRequest, GetCasinoGamesPayload } from 'src/casino/dto';
import { logger } from '@sentry/nestjs';
import { Sentry } from 'src/configs/sentry.config';
import { GameType, ReportType } from 'src/reports/dto';
import { UsersService } from 'src/users';
import { ActivityService } from 'src/activity';
import { BussinessReportService } from 'src/bussiness-report/bussiness-report.service';
import { AffiliateService } from 'src/affiliate/affiliate.service';
import dayjs from 'dayjs';
import { RecordType } from 'src/transactions/dto';
import { BonusService } from 'src/bonus/bonus.service';

@Injectable()
export class ExportsService extends BaseService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly transactionsService: TransactionsService,
    private readonly walletTransactionsService: WalletTransactionsService,
    private readonly usersService: UsersService,
    private readonly utilsService: UtilsService,
    private readonly casinoService: CasinoService,
    private readonly bankerService: BankerService,
    private readonly activityService: ActivityService,
    private readonly bussinessReportService: BussinessReportService,
    private readonly reportsService: ReportsService,
    private readonly affiliateService: AffiliateService,
    private readonly bonusService: BonusService,
  ) {
    super({ loggerDefaultMeta: { service: ExportsService.name } });
  }

  async onModuleInit() {
    const dbPath = path.join(__dirname, '..', '..', 'GeoLite2-City.mmdb');
    //this.lookup = await maxmind.open(dbPath);
  }
  async onApplicationBootstrap() {
    if (!this.utilsService.isMaster()) {
      return;
    }
    this.processExportRequest();
  }

  private convertToTimeZone(
    dateInput: string | Date | null | undefined,
    timeZone?: string,
  ): string {
    if (!dateInput) return '-';
    console.log('timeZone', timeZone);

    const tz = timeZone || 'Asia/Kolkata';

    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  }

  async casinoRoundHistoryReport({
    id,
    fromDate,
    toDate,
    userId,
    userType,
    _path,
    provider,
    status,
    format,
  }: {
    id: bigint;
    fromDate?: Date;
    toDate?: Date;
    userId: bigint;
    _path: string;
    provider?: string;
    status?: BetStatusType;
    format: ExportFormat;
    userType: UserType;
  }): Promise<any> {
    const query: CasinoHistoryRequest = {
      provider,
      status,
      fromDate,
      toDate,
    };
    const result = await this.casinoService.getRoundHistory(
      userId,
      userType,
      query,
      true,
    );

    const rawData = result.rounds as any[];

    const data = rawData.map((row, index) => ({
      'S.No': index + 1,
      'User ID': row.user?.id ?? '',
      Username: row.user?.username ?? '',
      'Game Name': row.casinoGame?.name ?? '',
      'Round ID': Number(row.roundId) ?? '',
      'Bet Amount': Number(row.totalBets ?? 0),
      'Win Amount': Number(row.totalWins ?? 0),
      'Loss Amount': Number(row.totalLosses ?? 0),
      Status: row.status,
      'Created At': row.createdAt ? row.createdAt.toISOString() : '',
    }));

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(
          data,
          id,
          'casino_round_history',
        );

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, 'casino_round_history');

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, 'casino_round_history');

      default:
        throw new Error('Unsupported export format');
    }
  }

  async casinoGameReport({
    id,
    provider,
    category,
    format,
  }: {
    id: bigint;
    provider?: string;
    category?: string;
    format: ExportFormat;
  }): Promise<any> {
    enum Status {
      ALL = 'ALL',
      ACTIVE = 'ACTIVE',
      INACTIVE = 'INACTIVE',
    }
    const status = Status.ALL;
    const q: GetCasinoGamesPayload = {
      provider,
      category,
      status,
    };
    const result = await this.casinoService.liveCasinoGames(
      q,
      true, // isExport
    );

    const rawData = result.data ?? result.games ?? [];

    const data = rawData.map((row, index) => ({
      'S.No': index + 1,
      'Game ID': row.id,
      'Game Name': row.name,
      Provider: row.gameProviderName,
      Category: row.category,
      'Game Code': row.code,
      'Image URL': row.gameImage,
      'Is Trending': row.isTrending ? 'Yes' : 'No',
      Status: row.status,
      'Created At': row.createdAt,
    }));

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, 'casino_games');

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, 'casino_games');

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, 'casino_games');

      default:
        throw new Error('Unsupported export format');
    }
  }

  async walletTransactionsReport(
    params: UserTransactionReportParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      searchByUserId,
      toDate,
      context,
      walletType,
      type,
      recordType,
      search,
      format,
      timezone,
    } = params;

    const result = await this.transactionsService.getAll(userType, {
      search,
      filters: {
        userId: searchByUserId ? BigInt(searchByUserId) : userId,
        fromDate,
        toDate,
        context,
        walletType,
        type,
        recordType,
        adminId: searchByUserId ? undefined : adminId,
      },
    });

    const rawData = result.data ?? [];
    let columns: string[];

    if (recordType === RecordType.Gaming) {
      columns = [
        'S.No',
        'Date/Time',
        'Type',
        'Remark',
        'Credit',
        'Debit',
        'Balance',
      ];
    } else if (recordType === RecordType.Transaction) {
      columns = [
        'S.No',
        'Date/Time',
        'Type',
        'Remark',
        'Credit',
        'Debit',
        'Balance',
        'From',
        'To',
      ];
    } else {
      columns = [
        'S.No',
        'Transaction Time',
        'Transaction Id',
        'Description',
        'Type',
        'Amount',
        'Status',
        'Context',
        'Balance',
        'From',
        'To',
      ];
    }

    const data = rawData.map((row, index) => {
      const mapped: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mapped[col] = index + 1;
            break;

          case 'Date/Time':
          case 'Transaction Time':
            mapped[col] = row.timestamp
              ? this.convertToTimeZone(row.timestamp, timezone)
              : '-';
            break;

          case 'Transaction Id':
            mapped[col] = row.id ?? '-';
            break;

          case 'Type':
            mapped[col] = row.type ?? '-';
            break;

          case 'Description':
            mapped[col] = row.narration ?? '-';
            break;

          case 'Amount':
            mapped[col] = row.amount ?? '-';
            break;

          case 'Credit':
            mapped[col] =
              row.type === 'Credit' ? Number(row.amount ?? '0') : Number('0');
            break;

          case 'Debit':
            mapped[col] =
              row.type === 'Debit' ? Number(row.amount ?? '0') : Number('0');
            break;

          case 'Status':
            mapped[col] = row.status ?? '-';
            break;

          case 'Context':
            mapped[col] = row.context ?? '-';
            break;

          case 'Remark':
            mapped[col] = row.narration ?? '-';
            break;

          case 'Balance':
            mapped[col] = Number(row.availableBalance ?? '0');
            break;

          case 'From':
            mapped[col] = row.fromAccount ?? '-';
            break;

          case 'To':
            mapped[col] = row.toAccount ?? '-';
            break;

          default:
            mapped[col] = '-';
        }
      });

      return mapped;
    });

    const reportName = `Account Statement`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error('Unsupported export format');
    }
  }

  async depositWithdrawExportReport(
    params: DepositWithdrawExportParams,
  ): Promise<any> {
    const {
      id,
      fromDate,
      toDate,
      status,
      type,
      userId,
      search,
      adminId,
      isWallet,
      paymentMode,
      isCrypto,
      isUpi,
      userType,
      isBank,
      format,
      timezone,
    } = params;

    let resolvedBankerId: bigint | undefined;

    if (adminId) resolvedBankerId = adminId;
    else if (userId) resolvedBankerId = userId;

    const options: GetDepositWithdrawQueryDto = {
      fromDate,
      toDate,
      status,
      paymentMode,
      type,
      isWallet,
      isCrypto,
      search,
      isUpi,
      isBank,
    };
    const result = await this.bankerService.getAllDepositWithdrawRequests(
      resolvedBankerId as bigint,
      userType,
      options,
      true,
    );
    const rawData = result.data as any[];
    const columns: string[] = ['S.No', 'User Name', 'Amount', 'Status'];
    if (type === WalletTransactionType.Credit) {
      if (isBank || isWallet) {
        columns.push('UTR Number', 'Screenshot');
      }
      if (isUpi) {
        columns.push('UTR Number', 'Screenshot');
      }
      if (isCrypto) {
        columns.push('ConversionRate', 'walletAddress', 'Screenshot');
      }
      if (isWallet) {
        columns.push('Payment Mode');
      }
    }
    if (type === WalletTransactionType.Debit) {
      if (isUpi) {
        columns.push('UPI ID');
      }

      if (isWallet) {
        columns.push('Mobile Number', 'Payment Mode');
      }

      if (isBank) {
        columns.push(
          'A/C Number',
          'Account Holder',
          'IBAN',
          'Bank Name',
          'Distict',
        );
      }
      if (isCrypto) {
        columns.push('walletAddress');
      }
    }
    columns.push('Req. At', 'Upd. At');

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'User Name':
            mappedRow[col] = row.user?.username ?? '-';
            break;

          case 'Amount':
            mappedRow[col] = Number(row.amount ?? 0);
            break;

          case 'Status':
            mappedRow[col] = row.status ?? '-';
            break;

          case 'UTR Number':
            mappedRow[col] = row.transactionCode ?? '-';
            break;

          case 'Screenshot':
            mappedRow[col] = row.image ?? '-';
            break;

          case 'ConversionRate':
            mappedRow[col] = row.conversionRate ?? '-';
            break;

          case 'walletAddress':
            mappedRow[col] = row.crypto?.walletAddress ?? '-';
            break;

          case 'Payment Mode':
            mappedRow[col] =
              row.digitalPayment?.paymentMode ?? row.paymentMode ?? '-';
            break;

          case 'UPI ID':
            mappedRow[col] = row.upi?.upiId ?? '-';
            break;

          case 'Mobile Number':
            mappedRow[col] = row.digitalPayment?.number ?? row.number ?? '-';
            break;

          case 'A/C Number':
            mappedRow[col] = row.bank?.accountNumber ?? '-';
            break;

          case 'Account Holder':
            mappedRow[col] = row.bank?.accountHolder ?? '-';
            break;

          case 'IBAN':
            mappedRow[col] = row.bank?.iban ?? row.bank?.ifsc ?? '-';
            break;

          case 'Bank Name':
            mappedRow[col] = row.bank?.bankName ?? '-';
            break;

          case 'Distict':
            mappedRow[col] = row.bank?.distict ?? row.bank?.distict ?? '-';
            break;

          case 'Req. At':
            mappedRow[col] = row.createdAt
              ? this.convertToTimeZone(row.createdAt, timezone)
              : '-';
            break;

          case 'Upd. At':
            mappedRow[col] = row.statusUpdatedAt
              ? this.convertToTimeZone(row.statusUpdatedAt, timezone)
              : '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    let modeSuffix = '';

    if (isUpi) {
      modeSuffix = 'UPI';
    } else if (isBank) {
      modeSuffix = 'Bank';
    } else if (isCrypto) {
      modeSuffix = 'Crypto';
    } else if (isWallet) {
      modeSuffix = 'E-Wallet';
    }

    const reportName = [type, modeSuffix].filter(Boolean).join('_');

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);
        break;

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);
        break;

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async betHistoryReport(params: BetHistoryReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      searchByUserName,
      search,
      betId,
      competitionId,
      searchByUserId,
      eventId,
      marketId,
      market,
      status,
      sport,
      reportType,
      fromDate,
      toDate,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }
    const result = await this.reportsService.getBetReports(
      resolvedUserId,
      userType ?? UserType.User,
      {
        searchByUserName,
        search,
        betId,
        competitionId,
        eventId,
        marketId,
        searchByUserId,
        market,
        status,
        sport,
        reportType,
        fromDate,
        toDate,
      },
      true, // isExport
    );

    const rawData = result.bets as any[];

    const ROLE_HIERARCHY_COLUMNS: Record<string, string[]> = {
      OWNER: ['SUPER ADMIN', 'ADMIN', 'SUPER MASTER', 'MASTER'],

      'SUPER ADMIN': ['ADMIN', 'SUPER MASTER', 'MASTER'],

      ADMIN: ['SUPER MASTER', 'MASTER'],

      'SUPER MASTER': ['MASTER'],
      MASTER: [],
    };

    let hierarchyColumns: string[] = [];

    if (adminId) {
      hierarchyColumns = ROLE_HIERARCHY_COLUMNS.OWNER;
    } else if (userId) {
      const role = await this.usersService.getRoleByUserId(userId);
      if (role?.name && role.name in ROLE_HIERARCHY_COLUMNS) {
        hierarchyColumns = ROLE_HIERARCHY_COLUMNS[role.name];
      }
    }

    const columns: string[] = [
      'S.No',
      ...(reportType === ReportType.HIERARCHY ? hierarchyColumns : []),
      'User',
      'Bet ID',
      'Status',
      'Bet Taken',
      'Bet Settled',
      'Sport',
      'Event',
      'Selection',
      'Market',
      'Type',
      'Odds',
      'Stack',
      'Result',
      'P/L',
      'Ip',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};
      const upline = row.uplineDetails ?? {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'SUPER ADMIN':
            mappedRow[col] = upline['SUPER ADMIN'] ?? '-';
            break;

          case 'ADMIN':
            mappedRow[col] = upline['ADMIN'] ?? '-';
            break;

          case 'SUPER MASTER':
            mappedRow[col] = upline['SUPER MASTER'] ?? '-';
            break;

          case 'MASTER':
            mappedRow[col] = upline['MASTER'] ?? '-';
            break;

          case 'User':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Status':
            mappedRow[col] = row.status ?? '-';
            break;

          case 'Bet ID':
            mappedRow[col] = row.id ? Number(row.id) : '-';
            break;

          case 'Bet Taken':
            mappedRow[col] = row.placedAt
              ? this.convertToTimeZone(row.placedAt, timezone)
              : '-';
            break;

          case 'Bet Settled':
            mappedRow[col] = row.settledAt
              ? this.convertToTimeZone(row.settledAt, timezone)
              : '-';
            break;

          case 'Sport':
            mappedRow[col] = row.sport ?? '-';
            break;

          case 'Event':
            mappedRow[col] = `${row.eventName ?? '-'} `;
            break;

          case 'Selection':
            mappedRow[col] = row.selection ?? '-';
            break;

          case 'Market':
            mappedRow[col] = row.marketName ?? '-';
            break;

          case 'Type':
            mappedRow[col] = row.betOn ?? '-';
            break;

          case 'Odds':
            mappedRow[col] = Number(row.odds ?? 0);
            break;

          case 'Stack':
            mappedRow[col] = Number(row.amount ?? 0);
            break;

          case 'Result':
            mappedRow[col] = row.result ?? '-';
            break;

          case 'P/L':
            mappedRow[col] = Number(row.payout ?? 0);
            break;

          case 'Ip':
            mappedRow[col] = row.ip ?? '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    let reportName;
    if (reportType) {
      reportName = `Bet_History_${reportType}`;
    } else {
      reportName = `Bet_History`;
    }

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async casinoBetHistoryReport(
    params: CasinoBetHistoryReportParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      betId,
      gameId,
      userType,
      reportType,
      searchByUserId,
      searchByGameId,
      fromDate,
      toDate,
      search,
      format,
      status,
      searchByUserName,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.reportsService.casinoBetReport(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        search,
        reportType,
        searchByUserName,
        searchByGameId,
        searchByUserId,
        status,
        betId,
        gameId,
      },
      true, // isExport
    );

    const rawData = result.casinoBets as any[];
    const ROLE_HIERARCHY_COLUMNS: Record<string, string[]> = {
      OWNER: ['SUPER ADMIN', 'ADMIN', 'SUPER MASTER', 'MASTER'],

      'SUPER ADMIN': ['ADMIN', 'SUPER MASTER', 'MASTER'],

      ADMIN: ['SUPER MASTER', 'MASTER'],

      'SUPER MASTER': ['MASTER'],
      MASTER: [],
    };

    let hierarchyColumns: string[] = [];

    if (adminId) {
      hierarchyColumns = ROLE_HIERARCHY_COLUMNS.OWNER;
    } else if (userId) {
      const role = await this.usersService.getRoleByUserId(userId);
      if (role?.name && role.name in ROLE_HIERARCHY_COLUMNS) {
        hierarchyColumns = ROLE_HIERARCHY_COLUMNS[role.name];
      }
    }

    const columns: string[] = [
      'S.No',
      ...(reportType === ReportType.HIERARCHY ? hierarchyColumns : []),
      'User Name',
      'Bet Id',
      'Date&Time',
      'Game Name',
      'Provider Name',
      'Game Id',
      'totalBets',
      'P/L',
      'Outcome',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};
      const upline = row.uplineDetails ?? {};

      const profitLoss =
        Number(row.totalBets ?? 0) - Number(row.totalWins ?? 0);

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'SUPER ADMIN':
            mappedRow[col] = upline['SUPER ADMIN'] ?? '-';
            break;

          case 'ADMIN':
            mappedRow[col] = upline['ADMIN'] ?? '-';
            break;

          case 'SUPER MASTER':
            mappedRow[col] = upline['SUPER MASTER'] ?? '-';
            break;

          case 'MASTER':
            mappedRow[col] = upline['MASTER'] ?? '-';
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Bet Id':
            mappedRow[col] = Number(row.id) ?? '-';
            break;

          case 'Date&Time':
            mappedRow[col] = row.createdAt
              ? this.convertToTimeZone(row.createdAt, timezone)
              : '-';
            break;

          case 'Game Name':
            mappedRow[col] = row.gameName ?? '-';
            break;

          case 'Provider Name':
            mappedRow[col] = row.gameProviderName ?? '-';
            break;

          case 'Game Id':
            mappedRow[col] = Number(row.gameId) ?? '-';
            break;

          case 'totalBets':
            mappedRow[col] = Number(row.totalBets) ?? '-';
            break;

          case 'P/L': {
            const totalWins = Number(row.totalWins ?? 0);
            const totalBets = Number(row.totalBets ?? 0);
            mappedRow[col] = totalWins - totalBets;
            break;
          }

          case 'Outcome':
            mappedRow[col] =
              Number(row.totalWins - row.totalBets) < 0 ? 'Loss' : 'Win';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    let reportName;
    if (reportType) {
      reportName = `Casino_Bet_History_${reportType}`;
    } else {
      reportName = `Casino_Bet_History`;
    }

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async playerProfitLossReport(
    params: PlayerProfitLossReportParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      searchByUsername,
      searchByUserId,
      reportType,
      transactionLimit,
      sport,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.reportsService.getPlayerProfitLoss(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        searchByUsername,
        searchByUserId,
        reportType,
        transactionLimit,
        sport,
      },
      true,
    );

    const rawData = result.users as any[];

    const footerConfig = {
      labelColumn: 'User Name',
      labelText: 'Total',
      values: {
        'User P/L': result.totalProfitLoss,
      },
    };

    const columns: string[] =
      reportType === ReportType.HIERARCHY
        ? ['S.No', 'User Name', 'Parent', 'User P/L']
        : ['S.No', 'User Name', 'User P/L'];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};
      const upline = row.uplineDetails ?? {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Parent':
            mappedRow[col] = upline['name'] ?? '-';
            break;

          case 'User P/L':
            mappedRow[col] = Number(row.profitLoss ?? 0);
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Player_Profit_Loss_${reportType}`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(
          data,
          id,
          reportName,
          footerConfig,
        );

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async casinoPlayerProfitLossReport(
    params: CasinoPlayerProfitLossReportParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      searchByUserName,
      searchByUserId,
      reportType,
      transactionLimit,
      path,
      format,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.reportsService.playerCasinoProfitReport(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        path, // todo: dynaic upline  path
        searchByUserId,
        transactionLimit,
        reportType,
        searchByUserName,
      },
      true,
    );

    const rawData = (result.casinoProfitLoss ?? []) as any[];
    const isHierarchy = reportType === ReportType.HIERARCHY;

    const footerConfig = {
      labelColumn: 'User Name',
      labelText: 'Total',
      values: {
        'User P/L': result.totals.totalProfitLoss,
      },
    };

    const columns: string[] = isHierarchy
      ? ['S.No', 'User Name', 'Parent', 'User P/L']
      : ['S.No', 'User Name', 'User P/L'];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};
      const upline = row.uplineDetails || {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'User P/L':
            mappedRow[col] = parseFloat(row.totalProfitLoss) || 0;
            break;

          case 'Parent':
            mappedRow[col] = upline['name'] ?? '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Casino_Player_Profit_Loss`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(
          data,
          id,
          reportName,
          footerConfig,
        );

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async casinoDownlineProfitLossReport(
    params: CasinoDownlineProfitLossReportParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      searchByUserName,
      transactionLimit,
      path,
      format,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.reportsService.getCasinoDownlineProfitLoss(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        transactionLimit,
        path, // todo: dynaic upline  path
        searchByUserName,
      },
      true, // isExport
    );

    const rawData = result.downlineUsers as any[];

    const footerConfig = {
      labelColumn: 'User Name',
      labelText: 'Total',
      values: {
        'Player P/L': Number(Number(result.totals).toFixed(2)),
        //'Client P/L': Number(Number(result.totalClientPl).toFixed(2)),
        'Downline P/L': Number(Number(result.totalDownlinePl).toFixed(2)),
        'Upline P/L': Number(Number(result.totalUplinePl).toFixed(2)),
      },
    };

    const columns: string[] = [
      'S.No',
      'User Name',
      'Player P/L',
      //'Client P/L',
      'Downline P/L',
      'Upline P/L',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Player P/L':
            mappedRow[col] = Number(row.profitLoss) ?? 0;
            break;

          // case 'Client P/L':
          //   mappedRow[col] = Number(row.clientPl) ?? 0;
          //   break;

          case 'Downline P/L':
            mappedRow[col] = Number(row.downlinePl) ?? 0;
            break;

          case 'Upline P/L':
            mappedRow[col] = Number(row.uplinePl) ?? 0;
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Casino_Downline_Profit_Loss`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(
          data,
          id,
          reportName,
          footerConfig,
        );

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async downlineProfitLossReport(
    params: DownlineProfitLossReportParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      searchByUserName,
      transactionLimit,
      path,
      format,
    } = params;

    const resolvedUserId: bigint =
      userId ??
      adminId ??
      (() => {
        throw new Error('UserId or AdminId is required');
      })();

    const result = await this.reportsService.getDownlineProfitLoss(
      resolvedUserId,
      userType ?? UserType.User,
      '0',
      {
        fromDate,
        toDate,
        path,
        transactionLimit,
        searchByUserName,
      },
      true,
    );

    const rawData = result.downlineUsers as any[];

    const footerConfig = {
      labelColumn: 'User Name',
      labelText: 'Total',
      values: {
        'Player P/L': Number(Number(result.totals).toFixed(2)),
        'Clint p/l': Number(Number(result.totalClientPl).toFixed(2)),
        'Downline P/L': Number(Number(result.totalDownlinePl ?? 0).toFixed(2)),
        'Upline P/L': Number(Number(result.totalUplinePl).toFixed(2)),
      },
    };

    const columns: string[] = [
      'S.No',
      'User Name',
      'Player P/L',
      'Clint p/l',
      'Downline P/L',
      'Upline P/L',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Player P/L':
            mappedRow[col] = Number(row.profitLoss) ?? 0;
            break;

          case 'Clint p/l':
            mappedRow[col] = Number(row.clientPl) ?? 0;
            break;

          case 'Downline P/L':
            mappedRow[col] = Number(row.downlinePl) ?? 0;
            break;

          case 'Upline P/L':
            mappedRow[col] = Number(row.uplinePl) ?? 0;
            break;

          default:
            mappedRow[col] = '-';
            break;
        }
      });

      return mappedRow;
    });

    const reportName = `Downline_Profit_Loss`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(
          data,
          id,
          reportName,
          footerConfig,
        );

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(
          data,
          id,
          reportName,
          footerConfig,
        );

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async eventProfitLossReport(
    params: EventProfitLossReportParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      gameType,
      searchByUserId,
      gameCategory,
      searchByEvent,
      transactionLimit,
      sport,
      format,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.reportsService.getEventProfitLossReport(
      searchByUserId ? BigInt(searchByUserId) : resolvedUserId,
      searchByUserId ? UserType.User : (userType ?? UserType.User),
      {
        fromDate,
        toDate,
        transactionLimit,
        userId: searchByUserId,
        gameType,
        gameCategory,
        searchByEvent,
        sport,
      },
      true, // isExport
    );

    const rawData = result.eventRows as any[];

    const columns: string[] = searchByUserId
      ? [
          'S.No',
          'Sport',
          gameType === GameType.CASINO ? 'Game Name' : 'Event Name',
          'TotalStake',
          'Player P/L',
        ]
      : [
          'S.No',
          'Sport',
          gameType === GameType.CASINO ? 'Game Name' : 'Event Name',
          'TotalStake',
          'Player P/L',
          'Downline P/L',
          //'Upline P/L',
          'Client P/L',
        ];

    let data: Record<string, any>[] = [];
    if (gameType === GameType.CASINO) {
      data = rawData.map((row, index) => {
        const mappedRow: Record<string, any> = {};
        columns.forEach((col) => {
          switch (col) {
            case 'S.No':
              mappedRow[col] = index + 1;
              break;

            case 'Game Name':
              mappedRow[col] = row.gameName ?? '-';
              break;

            case 'Sport':
              mappedRow[col] = row.gameProviderName ?? '-';
              break;

            case 'TotalStake':
              mappedRow[col] = Number(row.totalStake) ?? 0;
              break;

            case 'Player P/L':
              mappedRow[col] = Number(row.totalProfitLoss) ?? 0;
              break;

            case 'Downline P/L':
              if (!searchByUserId) {
                mappedRow[col] = Number(row.downlineProfitLoss) ?? 0;
              }
              break;

            case 'Client P/L':
              if (!searchByUserId) {
                mappedRow[col] = Number(row.uplineProfitLoss) ?? 0;
              }
              break;

            default:
              mappedRow[col] = '-';
          }
        });
        return mappedRow;
      });
    } else {
      data = rawData.map((row, index) => {
        const mappedRow: Record<string, any> = {};
        columns.forEach((col) => {
          switch (col) {
            case 'S.No':
              mappedRow[col] = index + 1;
              break;

            case 'Event Name':
              mappedRow[col] = row.eventName ?? '-';
              break;

            case 'Sport':
              mappedRow[col] = row.sport ?? '-';
              break;

            case 'TotalStake':
              mappedRow[col] = Number(row.totalStake) ?? 0;
              break;

            case 'Player P/L':
              mappedRow[col] = Number(row.totalProfitLoss) ?? 0;
              break;

            case 'Downline P/L':
              mappedRow[col] = Number(row.downlineProfitLoss) ?? 0;
              break;

            case 'Client P/L':
              mappedRow[col] = Number(row.uplineProfitLoss) ?? 0;
              break;

            default:
              mappedRow[col] = '-';
          }
        });
        return mappedRow;
      });
    }

    const reportName = `Event_Profit_Loss_${gameType}`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async activityReport(params: ActivityLogReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      format,
      timezone,
      searchByUserId,
    } = params;

    let resolvedUserId: bigint;
    let type = userType;
    if (searchByUserId) {
      resolvedUserId = BigInt(searchByUserId);
      type = UserType.User;
    } else if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.activityService.getByUserId(
      resolvedUserId,
      type ?? UserType.User,
      {
        fromDate,
        toDate,
      },
      true,
    );

    const rawData = result.data as any[];

    const columns: string[] = [
      'S.No',
      'Date/Time',
      'Login Status',
      'IP Address',
      'ISP',
      'City',
      'State',
      'Country',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Date/Time':
            mappedRow[col] = row.loginAt
              ? this.convertToTimeZone(row.loginAt, timezone)
              : '-';
            break;

          case 'Login Status':
            mappedRow[col] = row.loginStatus ?? '-';
            break;

          case 'IP Address':
            mappedRow[col] = row.ipAddress ?? '-';
            break;

          case 'ISP':
            mappedRow[col] = row.isp ?? '-';
            break;

          case 'City':
            mappedRow[col] = row.city ?? '-';
            break;

          case 'State':
            mappedRow[col] = row.state ?? '-';
            break;

          case 'Country':
            mappedRow[col] = row.country ?? '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Activity_Log`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async DepositReport(params: ReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      search,
      reportType,
      category,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.bussinessReportService.getDepositeReports(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        search,
        category,
        reportType,
      },
      true,
    );

    const rawData = result.deposits as any[];

    // Define columns based on report type
    const columns: string[] =
      reportType === ReportType.HIERARCHY
        ? [
            'S.No',
            'Parent',
            'User Name',
            'Amount',
            'Category',
            'Subcategory',
            'Tansactiondate',
          ]
        : [
            'S.No',
            'User Name',
            'Amount',
            'Category',
            'Subcategory',
            'Tansactiondate',
          ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};
      const upline = row.uplineDetails ?? {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Parent':
            mappedRow[col] = row.uplineDetails?.name ?? 'MA';
            break;

          case 'Parent':
            mappedRow[col] =
              row.uplineDetails?.name ?? row.uplineDetails?.['name'] ?? '-';
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? row.username ?? '-';
            break;

          case 'Amount':
            mappedRow[col] = Number(row.amount ?? 0);
            break;

          case 'Category':
            mappedRow[col] = row.category ?? '-';
            break;

          case 'Subcategory':
            mappedRow[col] = row.subCategory ?? row.subCategory ?? '-';
            break;

          case 'Tansactiondate':
            mappedRow[col] = row.transactionDate
              ? this.convertToTimeZone(row.transactionDate, timezone)
              : '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Deposit_Report_${reportType}`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async WithdrawalReport(params: ReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      search,
      reportType,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.bussinessReportService.getWithdrawReports(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        search,
        reportType,
      },
      true,
    );

    const rawData = result.withdraws as any[];

    const columns: string[] =
      reportType === ReportType.HIERARCHY
        ? [
            'S.No',
            'Parent',
            'User Name',
            'Amount',
            'Category',
            'Tansactiondate',
          ]
        : ['S.No', 'User Name', 'Amount', 'Category', 'Tansactiondate'];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Parent':
            mappedRow[col] = row.uplineDetails?.name ?? '-';
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? row.userName ?? '-';
            break;

          case 'Amount':
            mappedRow[col] = Number(row.amount ?? 0);
            break;

          case 'Category':
            mappedRow[col] = row.category ?? '-';
            break;

          case 'Tansactiondate':
            mappedRow[col] = row.transactionDate
              ? this.convertToTimeZone(row.transactionDate, timezone)
              : '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Withdrawal_Report_${reportType}`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async LoginReport(params: ReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      search,
      reportType,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    // Fetch login report
    const result = await this.bussinessReportService.getLoginReports(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        search,
        reportType,
      },
      true,
    );

    const rawData = result.logins as any[];

    const columns: string[] =
      reportType === ReportType.HIERARCHY
        ? ['S.No', 'Parent', 'User Name', 'Role', 'Login Date']
        : ['S.No', 'User Name', 'Role', 'Login Date'];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Parent':
            mappedRow[col] = row.uplineDetails?.name ?? '-';
            break;

          // case 'Parent':
          //   mappedRow[col] =
          //     row.uplineDetails?.MASTER ??
          //     row.uplineDetails?.['SUPER MASTER'] ??
          //     '-';
          //   break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Role':
            mappedRow[col] = row.role ?? 'PL';
            break;

          case 'Login Date':
            mappedRow[col] = row.lastLoginTime
              ? this.convertToTimeZone(row.lastLoginTime, timezone)
              : '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Login_Report_${reportType}`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async ActiveUserReport(params: ReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      search,
      reportType,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.bussinessReportService.getActiveUserReports(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        search,
        reportType,
      },
      true,
    );

    const rawData = result.activeUsers as any[];

    const columns: string[] =
      reportType === ReportType.HIERARCHY
        ? ['S.No', 'Parent', 'User Name', 'Role', 'Last Active Time']
        : ['S.No', 'User Name', 'Role', 'Last Active Time'];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Parent':
            mappedRow[col] = row.uplineDetails?.name ?? '-'; // Always MASTER
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Role':
            mappedRow[col] = row.role ?? 'PL';
            break;

          case 'Last Active Time':
            mappedRow[col] = row.lastTransactionTime
              ? this.convertToTimeZone(row.lastTransactionTime, timezone)
              : '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Active_User_Report_${reportType}`;
    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async SignupReport(params: ReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      search,
      reportType,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.bussinessReportService.getSignupReports(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        search,
        reportType,
      },
      true,
    );

    const rawData = result.signups as any[];

    const columns: string[] =
      reportType === ReportType.HIERARCHY
        ? ['S.No', 'Parent', 'User Name', 'Mobile', 'Signup Date']
        : ['S.No', 'User Name', 'Mobile', 'Signup Date'];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Parent':
            mappedRow[col] = row.uplineDetails?.name ?? '-'; // Always MASTER if present
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Mobile':
            mappedRow[col] = row.mobile ?? '-';
            break;

          case 'Signup Date':
            mappedRow[col] = row.createdAt
              ? this.convertToTimeZone(row.createdAt, timezone)
              : '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Signup_Report`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async IdleUserReport(params: ReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      fromDate,
      toDate,
      search,
      reportType,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.bussinessReportService.getIdleUsersReports(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        search,
        reportType,
      },
      true,
    );

    const rawData = result.idleUsers as any[];

    const columns: string[] =
      reportType === ReportType.HIERARCHY
        ? [
            'S.No',
            'Parent',
            'User Name',
            'Mobile',
            'Total Deposits',
            'Last Deposit Amount',
            'Last Deposit Date',
          ]
        : [
            'S.No',
            'User Name',
            'Mobile',
            'Total Deposits',
            'Last Deposit Amount',
            'Last Deposit Date',
          ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Parent':
            mappedRow[col] = row.uplineDetails?.name ?? '-'; // Always MASTER
            break;

          case 'User Name':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Mobile':
            mappedRow[col] = row.mobile ?? '-';
            break;

          case 'Total Deposits':
            mappedRow[col] = Number(row.totalDeposits ?? 0);
            break;

          case 'Last Deposit Amount':
            mappedRow[col] = Number(row.last_deposit_amount ?? 0);
            break;

          case 'Last Deposit Date':
            mappedRow[col] = row.last_deposit_date
              ? this.convertToTimeZone(row.last_deposit_date, timezone)
              : '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Idle_User_Report_${reportType}`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async InactiveUserReport(params: InactiveUserReportParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      username,
      level,
      rollId,
      status,
      fromDate,
      toDate,
      path,
      format,
    } = params;

    let resolvedUserId: number;

    if (userId) {
      resolvedUserId = Number(userId);
    } else if (adminId) {
      resolvedUserId = Number(adminId);
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.usersService.getSubUsers(
      resolvedUserId,
      path, // todo: add path(upline path) if required
      {
        status,
        rollId,
        level,
        username,
        fromDate,
        toDate,
      },
      userType ?? UserType.User,
      true,
      true,
    );

    console.log('params', result);
    const rawData = result.downlineUsers as any[];
    const columns: string[] = [
      'S.No',
      'Username',
      'Balance',
      'Total P/L',
      'Exposure',
      'User Balance',
      'Status',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Parent':
            mappedRow[col] = row.uplineDetails?.name ?? '-';
            break;

          case 'Username':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Balance':
            mappedRow[col] = Number(row.downlineBalance ?? 0);
            break;

          case 'Total P/L':
            mappedRow[col] = Number(row.referance ?? 0);
            break;

          case 'Exposure':
            mappedRow[col] = Number(row.exposure ?? 0);
            break;

          case 'User Balance':
            mappedRow[col] = Number(row.playerBalance ?? 0);
            break;

          case 'Status':
            mappedRow[col] = row.status ?? '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Inactive_User_Report`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);
      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);
      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async AffiliateReport(params: ExportAffiliateListParams): Promise<any> {
    const { id, search, status, format } = params;

    const result = await this.affiliateService.getAffiliateList(
      {
        search,
        status,
      },
      true,
    );

    const rawData = result.data as any[];

    const columns: string[] = [
      'S.No',
      'Affiliate ID',
      'Affiliate Name',
      'Affiliate Code',
      'Mobile',
      'Status',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Affiliate ID':
            mappedRow[col] = row.id ? `AFF${row.id}` : '-';
            break;

          case 'Affiliate Name':
            mappedRow[col] = row.users.username ?? row.users.username ?? '-';
            break;

          case 'Affiliate Code':
            mappedRow[col] = row.affiliateCode ?? '-';
            break;

          case 'Mobile':
            mappedRow[col] = row.users.mobile ?? '-';
            break;

          case 'Status':
            mappedRow[col] = row.status ?? ' ';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Affiliate_List_Report`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async AffiliateCommissionReport(
    params: ExportAffiliateCommissionParams,
  ): Promise<any> {
    const { id, search, fromDate, toDate, status, format } = params;

    const result =
      await this.affiliateService.getWeeklyCommissionReportForAdmin(
        {
          search,
          status,
          fromDate,
          toDate,
        },
        true,
      );

    const rawData = result.weeklyDataRaw as any[];

    const columns: string[] = [
      'S.No',
      'Week Range',
      'Affiliate ID',
      'Affiliate Name',
      'Active Users',
      'Total Player Loss',
      'Deduction Amount',
      'Commission %',
      'Commission Amount',
      'Status',
    ];

    // Mapping each row
    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Week Range':
            mappedRow[col] =
              `${dayjs(row.weekStart).format('DD MMM')} - ${dayjs(row.weekEnd).format('DD MMM')}`;
            break;

          case 'Affiliate ID':
            mappedRow[col] = row.affiliate?.id
              ? `AFF${row.affiliate?.id}`
              : '-';
            break;

          case 'Affiliate Name':
            mappedRow[col] = row.affiliate?.users?.username ?? '-';
            break;

          case 'Active Users':
            mappedRow[col] = row.activeUsers ?? 0;
            break;

          case 'Total Player Loss':
            mappedRow[col] = row.totalLoss ?? 0;
            break;

          case 'Deduction Amount':
            mappedRow[col] = row.deductionAmount ?? 0;
            break;

          case 'Commission %':
            mappedRow[col] = row.commissionPercent ?? '0%';
            break;

          case 'Commission Amount':
            mappedRow[col] = row.commissionAmount ?? 0;
            break;

          case 'Status':
            mappedRow[col] = row.status ?? '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Affiliate_Commission_Report`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async UserTransactionReport(
    params: ExportUserTransactionParams,
  ): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,
      searchByUserId,
      fromDate,
      toDate,
      format,
      timezone,
    } = params;

    const result =
      await this.transactionsService.getDepositWithdrawTransactionByUserId(
        BigInt(searchByUserId),
        {
          fromDate,
          toDate,
        },
        true,
      );

    const rawData = result.transactions as any[];

    const columns: string[] = [
      'S.No',
      'Date/Time',
      'Credit',
      'Debit',
      'Balance',
      'From',
      'To',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Date/Time':
            mappedRow[col] = row.timestamp
              ? this.convertToTimeZone(row.timestamp, timezone)
              : '-';
            break;

          case 'Credit':
            mappedRow[col] =
              row.type === 'Credit' ? Number(row.amount ?? '0') : Number('0');
            break;

          case 'Debit':
            mappedRow[col] =
              row.type === 'Debit' ? Number(row.amount ?? '0') : Number('0');
            break;

          case 'Balance':
            mappedRow[col] = Number(row.availableBalance ?? 0);
            break;

          case 'From':
            mappedRow[col] = row.fromAccount ?? '-';
            break;

          case 'To':
            mappedRow[col] = row.toAccount ?? '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `User_Transaction_Report`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async BonusStatementReport(params: ExportBonusStatementParams): Promise<any> {
    const {
      id,
      userId,
      adminId,
      userType,

      status,
      category,
      releaseType,
      approvalType,
      search,
      searchbyuserId,
      searchbyusername,

      fromDate,
      toDate,

      format,
      timezone,
    } = params;

    const result = await this.bonusService.getAllBonusApplicants({
      status,
      category,
      releaseType,
      search,
      userId: searchbyuserId ? Number(searchbyuserId) : undefined,
      username: searchbyusername,
      approvalType,
      startDate: fromDate?.toISOString(),
      endDate: toDate?.toISOString(),
      isExport: true,
    });

    const rawData = result?.bonusApplicants ?? [];

    const columns = [
      'S.No',
      'Username',
      'Bonus Name',
      'Bonus ID',
      'Category',
      'Release Type',
      'AwardedAmount',
      'TurnoverCompleted',
      'TurnoverRequired',
      'Installments',
      'Awarded At',
      'Expire At',
      'Status',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Username':
            mappedRow[col] = row.user?.username ?? '-';
            break;

          case 'Bonus Name':
            mappedRow[col] = row.bonus?.name ?? '-';
            break;

          case 'Bonus ID':
            mappedRow[col] = row.bonusId ?? '-';
            break;

          case 'Category':
            mappedRow[col] = row.bonus?.category ?? '-';
            break;

          case 'Release Type':
            mappedRow[col] = row.bonus?.releaseType ?? '-';
            break;

          case 'AwardedAmount':
            mappedRow[col] = Number(row.awardedAmount ?? 0);
            break;

          case 'TurnoverCompleted':
            mappedRow[col] = `${Number(row.turnoverCompleted ?? 0)}`;
            break;

          case 'TurnoverRequired':
            mappedRow[col] = `${Number(row.turnoverRequired ?? 0)}`;
            break;

          case 'Installments':
            mappedRow[col] = row.bonus?.installments ?? 0;
            break;

          case 'Awarded At':
            mappedRow[col] = row.awardedAt
              ? this.convertToTimeZone(row.awardedAt, timezone)
              : '-';
            break;

          case 'Expire At':
            mappedRow[col] = row.expireAt
              ? this.convertToTimeZone(row.expireAt, timezone)
              : '-';
            break;

          case 'Status':
            mappedRow[col] = row.status ?? '-';
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = 'Bonus_Statement_Report';

    switch (format) {
      case ExportFormat.Excel:
        return this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async UserGameTransactionReport(
    params: ExportUserGameTransactionParams,
  ): Promise<any> {
    const {
      id,
      userId,
      userType,
      adminId,
      fromDate,
      toDate,
      context,
      type,
      walletType,
      search,
      format,
      timezone,
    } = params;

    let resolvedUserId: bigint;

    if (userId) {
      resolvedUserId = userId;
    } else if (adminId) {
      resolvedUserId = adminId;
    } else {
      throw new Error('UserId or AdminId is required');
    }

    const result = await this.transactionsService.getDownlineGameTransactions(
      resolvedUserId,
      userType ?? UserType.User,
      {
        fromDate,
        toDate,
        context,
        type,
        walletType,
        search,
      },
      true,
    );

    const rawData = result.transactions as any[];

    const columns: string[] = [
      'S.No',
      'Transaction Id',
      'Transaction Time',
      'Player',
      'Description',
      'Type',
      'Amount',
      'Context',
      'Status',
      'Balance',
    ];

    const data = rawData.map((row, index) => {
      const mappedRow: Record<string, any> = {};

      columns.forEach((col) => {
        switch (col) {
          case 'S.No':
            mappedRow[col] = index + 1;
            break;

          case 'Transaction Id':
            mappedRow[col] = Number(row.id) ?? '-';
            break;

          case 'Transaction Time':
            mappedRow[col] = row.timestamp
              ? this.convertToTimeZone(row.timestamp, timezone)
              : '-';
            break;

          case 'Player':
            mappedRow[col] = row.username ?? '-';
            break;

          case 'Description':
            mappedRow[col] = row.narration ?? '-';
            break;

          case 'Type':
            mappedRow[col] = row.type ?? '-'; // Credit / Debit
            break;

          case 'Amount':
            mappedRow[col] = Number(row.amount ?? 0);
            break;

          case 'Context':
            mappedRow[col] = row.context ?? '-'; // Won / Lost / Bet etc
            break;

          case 'Status':
            mappedRow[col] = row.status ?? '-';
            break;

          case 'Balance':
            mappedRow[col] = Number(row.availableBalance ?? 0);
            break;

          default:
            mappedRow[col] = '-';
        }
      });

      return mappedRow;
    });

    const reportName = `Game_Transaction_Report`;

    switch (format) {
      case ExportFormat.Excel:
        return await this.generateDynamicExcel(data, id, reportName);

      case ExportFormat.Pdf:
        return await this.generateDynamicPdf(data, id, reportName);

      case ExportFormat.Csv:
        return await this.generateDynamicCsv(data, id, reportName);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async generateDynamicCsv(
    data: any[],
    exportId: bigint,
    filePrefix = 'report',
    footerConfig?: {
      labelColumn: string;
      labelText: string;
      values: Record<string, number>;
    },
  ): Promise<void> {
    try {
      let headers: string[] = [];

      if (data?.length > 0) {
        headers = Object.keys(data[0]);
      } else if (footerConfig) {
        // When no data but totals exist
        headers = [
          footerConfig.labelColumn,
          ...Object.keys(footerConfig.values),
        ];
      } else {
        headers = ['No Data Found'];
      }

      const filename = `${filePrefix}_${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.csv`;

      const filePath = path.join(this.storageService.diskDestination, filename);

      if (!fs.existsSync(this.storageService.diskDestination)) {
        fs.mkdirSync(this.storageService.diskDestination, { recursive: true });
      }

      const fileStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
      fileStream.write('\uFEFF'); // BOM

      const csvStream = fastcsv.format({
        headers: headers,
        writeHeaders: true,
        quote: '"',
        quoteHeaders: true,
        quoteColumns: true,
      });

      csvStream.pipe(fileStream);

      if (data?.length > 0) {
        data.forEach((row) => {
          const formattedRow: Record<string, any> = {};

          headers.forEach((h) => {
            let value = row[h];

            if (value instanceof Date) {
              value = value.toLocaleString();
            }

            formattedRow[h] = value ?? '-';
          });

          csvStream.write(formattedRow);
        });
      }

      if (footerConfig) {
        const footerRow: Record<string, any> = {};

        headers.forEach((h) => {
          if (h === footerConfig.labelColumn) {
            footerRow[h] = footerConfig.labelText;
          } else if (footerConfig.values[h] !== undefined) {
            footerRow[h] = footerConfig.values[h];
          } else {
            footerRow[h] = '-';
          }
        });

        csvStream.write(footerRow);
      }

      csvStream.end();

      await this.prisma.export.update({
        where: { id: exportId },
        data: {
          status: ExportStatus.Completed,
          attachment: this.storageService.getFileUrl1(filename),
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      await this.prisma.export.update({
        where: { id: exportId },
        data: { status: ExportStatus.Failed },
      });

      logger.error(`CSV export failed: ${error.message}`);
      throw new Error(`CSV export failed: ${error.message}`);
    }
  }

  async generateDynamicExcel(
    data: any[],
    exportId: bigint,
    filePrefix = 'report',
    footerConfig?: {
      labelColumn: string;
      labelText: string;
      values: Record<string, number>;
    },
  ): Promise<string> {
    try {
      const dir = this.storageService.diskDestination;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = `${filePrefix}_${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.xlsx`;

      const filepath = path.join(dir, filename);

      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        filename: filepath,
        useStyles: true,
      });

      const worksheet = workbook.addWorksheet('Report');

      let headers: string[] = [];

      if (data?.length > 0) {
        headers = Object.keys(data[0]);
      } else if (footerConfig) {
        headers = Object.keys(footerConfig.values);
        headers.unshift(footerConfig.labelColumn);
      } else {
        headers = ['No Data'];
      }

      worksheet.columns = headers.map((key) => ({
        header: key,
        key,
        width: 25,
        style: {
          alignment: {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true,
          },
        },
      }));

      if (data?.length > 0) {
        for (const row of data) {
          const excelRow: any = {};
          headers.forEach((h) => {
            excelRow[h] =
              row[h] instanceof Date
                ? row[h]
                : row[h] !== undefined
                  ? row[h]
                  : '-';
          });

          const addedRow = worksheet.addRow(excelRow);
          addedRow.height = 28;
          addedRow.commit();
        }
      }

      // if (footerConfig) {
      //   const footerRowData: any = {};

      //   headers.forEach((h) => {
      //     if (h === footerConfig.labelColumn) {
      //       footerRowData[h] = footerConfig.labelText;
      //     } else if (footerConfig.values[h] !== undefined) {
      //       footerRowData[h] = footerConfig.values[h];
      //     } else {
      //       footerRowData[h] = '-';
      //     }
      //   });

      //   const footerRow = worksheet.addRow(footerRowData);

      //   footerRow.eachCell((cell) => {
      //     cell.font = { bold: true };
      //     cell.alignment = { vertical: 'middle', horizontal: 'right' };
      //     cell.fill = {
      //       type: 'pattern',
      //       pattern: 'solid',
      //       fgColor: { argb: 'E6F4EA' },
      //     };
      //     cell.border = {
      //       top: { style: 'thin' },
      //       left: { style: 'thin' },
      //       bottom: { style: 'thin' },
      //       right: { style: 'thin' },
      //     };
      //   });

      //   footerRow.height = 30;
      //   footerRow.commit();
      // }

      if (footerConfig) {
        const footerRowData: any = {};

        headers.forEach((h) => {
          if (h === footerConfig.labelColumn) {
            footerRowData[h] = footerConfig.labelText;
          } else if (footerConfig.values[h] !== undefined) {
            footerRowData[h] = footerConfig.values[h];
          } else {
            footerRowData[h] = '-';
          }
        });

        const footerRow = worksheet.addRow(footerRowData);

        footerRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' }; // FIXED
          // cell.fill = {
          //   type: 'pattern',
          //   pattern: 'solid',
          //   fgColor: { argb: 'E6F4EA' }, // KEEP SAME COLOR
          // };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });

        footerRow.height = 30;
        footerRow.commit();
      }

      await workbook.commit();

      await this.prisma.export.update({
        where: { id: exportId },
        data: {
          status: ExportStatus.Completed,
          attachment: this.storageService.getFileUrl1(filename),
          updatedAt: new Date(),
        },
      });

      return filename;
    } catch (err: any) {
      await this.prisma.export.update({
        where: { id: exportId },
        data: { status: ExportStatus.Failed },
      });

      throw new Error(`Excel export failed: ${err.message}`);
    }
  }

  async generateDynamicPdf(
    data: any[],
    exportId: bigint,
    filePrefix = 'report',
    footerConfig?: {
      labelColumn: string;
      labelText: string;
      values: Record<string, number>;
    },
  ): Promise<void> {
    try {
      const dir = this.storageService.diskDestination;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = `${filePrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
      const filePath = path.join(dir, filename);

      const doc = new PDFDocument({
        margin: 20,
        size: 'A3',
        layout: 'landscape',
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Title
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(`${filePrefix.replace(/_/g, ' ')} Report`, { align: 'center' });
      doc.moveDown(1);

      if (!data || data.length === 0) {
        doc
          .fontSize(12)
          .font('Helvetica')
          .fillColor('gray')
          .text('No data available for the selected filters.', {
            align: 'center',
          });

        doc.end();

        await this.prisma.export.update({
          where: { id: exportId },
          data: {
            status: ExportStatus.Completed,
            attachment: this.storageService.getFileUrl1(filename),
            updatedAt: new Date(),
          },
        });
        return;
      }

      const headers = Object.keys(data[0]);

      const table = {
        x: 20,
        y: doc.y,
        rowHeight: 28,
        colWidth: (doc.page.width - 40) / headers.length,
      };

      const pageBottom = doc.page.height - 30;

      const drawHeader = () => {
        let x = table.x;

        doc.save();
        doc.fontSize(10).font('Helvetica-Bold');

        doc.fillColor('#E8E8E8');
        doc.rect(20, table.y, doc.page.width - 40, table.rowHeight).fill();
        doc.fillColor('black');

        headers.forEach((h) => {
          doc.text(h, x + 4, table.y + 8, {
            width: table.colWidth - 8,
            align: 'left',
          });

          doc.rect(x, table.y, table.colWidth, table.rowHeight).stroke();
          x += table.colWidth;
        });

        doc.restore();
        table.y += table.rowHeight;
      };

      const drawFooterTotal = () => {
        if (!footerConfig) return;

        let x = table.x;

        doc.save();

        const totalWidth = table.colWidth * headers.length;

        doc.fillColor('#E6F4EA');

        doc.rect(table.x, table.y, totalWidth, table.rowHeight).fill();

        doc.font('Helvetica-Bold').fontSize(10).fillColor('black');

        headers.forEach((h) => {
          let value = '-';

          if (h === footerConfig.labelColumn) {
            value = footerConfig.labelText;
          }

          if (footerConfig.values[h] !== undefined) {
            value = footerConfig.values[h].toString();
          }

          doc.text(value, x + 4, table.y + 6, {
            width: table.colWidth - 8,
            align: 'left',
          });

          doc.rect(x, table.y, table.colWidth, table.rowHeight).stroke();
          x += table.colWidth;
        });

        doc.restore();
        table.y += table.rowHeight;
      };

      drawHeader();

      for (const row of data) {
        // Check page break
        if (table.y + table.rowHeight > pageBottom) {
          doc.addPage({ size: 'A3', layout: 'landscape' });
          table.y = 20;
          drawHeader();
        }

        let x = table.x;

        headers.forEach((h) => {
          const val =
            row[h] instanceof Date
              ? row[h].toLocaleString()
              : (row[h] ?? '-').toString();

          doc.fontSize(9).font('Helvetica');
          doc.text(val, x + 4, table.y + 6, {
            width: table.colWidth - 8,
            height: table.rowHeight - 6,
          });

          doc.rect(x, table.y, table.colWidth, table.rowHeight).stroke();
          x += table.colWidth;
        });

        table.y += table.rowHeight;
      }

      if (footerConfig) {
        drawFooterTotal();
      }

      doc.end();
      console.log('export', this.storageService.getFileUrl1(filename));
      await this.prisma.export.update({
        where: { id: exportId },
        data: {
          status: ExportStatus.Completed,
          attachment: this.storageService.getFileUrl1(filename),

          updatedAt: new Date(),
        },
      });
    } catch (err: any) {
      await this.prisma.export.update({
        where: { id: exportId },
        data: { status: ExportStatus.Failed },
      });
      logger.error(`PDF export failed: ${err.message}`);
      throw new Error(`PDF export failed: ${err.message}`);
    }
  }
  async getExportReport(userId: bigint, options?: getExportReportDto) {
    let take = undefined,
      skip = undefined;
    if (
      options?.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    const where: Prisma.ExportWhereInput = {
      adminId: userId,
    };

    if (options?.fromDate || options?.toDate) {
      where.timestamp = {};
      if (options.fromDate) where.timestamp.gte = options.fromDate;
      if (options.toDate) where.timestamp.lte = options.toDate;
    }

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.exportFormat) {
      where.format = options.exportFormat;
    }

    const search = options?.search?.trim();
    if (search) {
      where.attachment = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const count = await this.prisma.export.count({ where });

    const data = await this.prisma.export.findMany({
      select: {
        id: true,
        attachment: true,
        status: true,
        type: true,
        format: true,
      },
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take,
    });

    const totalPage = Math.ceil(
      count /
        (options?.limit && options.limit > 0
          ? options.limit
          : count < 1
            ? 1
            : count),
    );

    return {
      data,
      pagination: {
        count,
        limit: take ?? count,
        currentPage: options?.page ?? 1,
        totalPage,
      },
    };
  }

  async getUserExportAttachments(
    userId: bigint,
    userType: UserType,
    options: getExportReportDto,
  ) {
    let take = undefined,
      skip = undefined;
    if (
      options?.page &&
      options.limit &&
      !isNaN(options.limit) &&
      !isNaN(options.page)
    ) {
      options.page = options.page < 1 ? 1 : options.page;
      take = options.limit;
      skip = (options.page - 1) * options.limit;
    }

    const where: Prisma.ExportWhereInput = {};
    if (userType === UserType.Admin) {
      where.adminId = userId;
    } else {
      where.userId = userId;
    }

    if (options?.fromDate || options?.toDate) {
      where.timestamp = {};
      if (options.fromDate) where.timestamp.gte = options.fromDate;
      if (options.toDate) where.timestamp.lte = options.toDate;
    }

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.exportFormat) {
      where.format = options.exportFormat;
    }

    const search = options?.search?.trim();
    if (search) {
      where.attachment = {
        contains: search,
        mode: 'insensitive',
      };
    }
    const total = await this.prisma.export.count({ where });

    const data = await this.prisma.export.findMany({
      select: {
        id: true,
        attachment: true,
        status: true,
        type: true,
        format: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take,
    });

    const totalPage = Math.ceil(
      total /
        (options.limit && options.limit > 0
          ? options.limit
          : total < 1
            ? 1
            : total),
    );

    const pagination: Pagination = {
      totalItems: total,
      limit: take ?? total,
      currentPage: options.page ?? 1,
      totalPage,
    };

    return {
      data,
      pagination,
      success: true,
    };
  }

  private async processSingleExport(request: any): Promise<void> {
    try {
      switch (request.type) {
        case ExportType.casinoRoundHistory: {
          const filters = request.filters as Record<string, any>;
          await this.casinoRoundHistoryReport({
            id: request.id,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            userId: filters.userId ?? undefined,
            _path: filters._path ?? undefined,
            provider: filters.provider ?? undefined,
            status: filters.status ?? undefined,
            format: request.format,
            userType: filters.userType ?? undefined,
          });
          break;
        }
        case ExportType.casinoGame: {
          const filters = request.filters as Record<string, any>;
          await this.casinoGameReport({
            id: request.id,
            format: request.format,
            provider: filters.provider ?? undefined,
            category: filters.category ?? undefined,
          });
          break;
        }

        case ExportType.userTransaction: {
          const filters = request.filters as Record<string, any>;

          await this.walletTransactionsReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            context: filters.context ?? undefined,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            recordType: filters.recordType ?? undefined,
            type: filters.type ?? undefined,
            walletType: filters.walletType ?? undefined,
            search: filters.search ?? undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }
        // case ExportType.userTransaction: {
        //   const filters = request.filters as Record<string, any>;
        //   await this.walletTransactionsReport({
        //     id: request.id,
        //     userContext: filters.userContext ?? undefined,
        //     fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
        //     toDate: filters.toDate ? new Date(filters.toDate) : undefined,
        //     userId: filters.userId ?? undefined,
        //     context: filters.context ?? undefined,
        //     walletType: filters.walletType ?? undefined,
        //     type: filters.type ?? undefined,
        //     format: request.format,
        //   });
        //   break;
        // }

        case ExportType.depositWithdraw: {
          const filters = request.filters as Record<string, any>;
          await this.depositWithdrawExportReport({
            id: request.id,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            status: filters.status ?? undefined,
            type: filters.type ?? undefined,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType,
            search: filters.search ?? undefined,
            isUpi: filters.isUpi ?? undefined,
            isBank: filters.isBank ?? undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }
        case ExportType.betReports: {
          const filters = request.filters as Record<string, any>;

          await this.betHistoryReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,

            userType: filters.userType ?? undefined,
            timezone: request.timezone ?? undefined,
            searchByUserName: filters.searchByUserName ?? undefined,
            search: filters.search ?? undefined,

            betId: filters.betId ? Number(filters.betId) : undefined,
            competitionId: filters.competitionId
              ? Number(filters.competitionId)
              : undefined,
            eventId: filters.eventId ? Number(filters.eventId) : undefined,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            marketId: filters.marketId ?? undefined,
            market: filters.market ?? undefined,

            status: filters.status ?? undefined,
            sport: filters.sport ?? undefined,
            reportType: filters.reportType ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,

            format: request.format,
          });

          break;
        }
        case ExportType.casinoBetReports: {
          const filters = request.filters as Record<string, any>;

          await this.casinoBetHistoryReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            searchByUserName: filters.searchByUserName ?? undefined,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            searchByGameId: filters.gameId ? Number(filters.gameId) : undefined,
            search: filters.search ?? undefined,
            status: filters.status ?? undefined,
            betId: filters.betId ? Number(filters.betId) : undefined,
            gameId: filters.gameId ? Number(filters.gameId) : undefined,
            reportType: filters.reportType ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,

            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.casinoPlayerProfitLoss: {
          const filters = request.filters as Record<string, any>;

          await this.casinoPlayerProfitLossReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            reportType: filters.reportType,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            searchByUserName: filters.searchByUserName ?? undefined,
            transactionLimit: filters.transactionLimit ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            path: filters.path ?? '0',
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.casinoDownlineProfitLoss: {
          const filters = request.filters as Record<string, any>;

          await this.casinoDownlineProfitLossReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            searchByUserName: filters.searchByUserName ?? undefined,
            reportType: filters.reportType,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            transactionLimit: filters.transactionLimit ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            path: filters.path ?? '0',
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.eventProfitLoss: {
          const filters = request.filters as Record<string, any>;
          await this.eventProfitLossReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            gameCategory: filters.gameCategory ?? undefined,
            userType: filters.userType ?? undefined,
            searchByEvent: filters.searchByEvent ?? undefined,
            transactionLimit: filters.transactionLimit ?? undefined,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            gameType: filters.gameType,
            sport: filters.sport ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.downlineProfitLoss: {
          const filters = request.filters as Record<string, any>;

          await this.downlineProfitLossReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,

            userType: filters.userType ?? undefined,
            searchByUserName: filters.searchByUserName ?? undefined,
            transactionLimit: filters.transactionLimit
              ? Number(filters.transactionLimit)
              : undefined,

            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            path: filters.path ?? '0',
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.playerProfitLoss: {
          const filters = request.filters as Record<string, any>;

          await this.playerProfitLossReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            reportType: filters.reportType,
            searchByUsername: filters.searchByUsername ?? undefined,
            transactionLimit: filters.transactionLimit ?? undefined,
            sport: filters.sport ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.depositReport: {
          const filters = request.filters as Record<string, any>;

          await this.DepositReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            category: filters.category,
            reportType: filters.reportType,
            search: filters.search ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.withdrawReport: {
          const filters = request.filters as Record<string, any>;

          await this.WithdrawalReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            reportType: filters.reportType,
            search: filters.search ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.loginReport: {
          const filters = request.filters as Record<string, any>;

          await this.LoginReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            reportType: filters.reportType,
            search: filters.search ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }
        case ExportType.activeUsersReport: {
          const filters = request.filters as Record<string, any>;

          await this.ActiveUserReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            reportType: filters.reportType,
            search: filters.search ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.signupReport: {
          const filters = request.filters as Record<string, any>;

          await this.SignupReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            reportType: filters.reportType,
            search: filters.search ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.idleUsersReport: {
          const filters = request.filters as Record<string, any>;

          await this.IdleUserReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            reportType: filters.reportType,
            search: filters.search ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.subUsersReport: {
          const filters = request.filters as Record<string, any>;

          await this.InactiveUserReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            username: filters.username ?? undefined,
            status: filters.status,
            level: filters.level ? Number(filters.level) : undefined,
            rollId: filters.rollId ? Number(filters.rollId) : undefined,
            userType: filters.userType ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            path: filters.path ?? '0',
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.affiliateList: {
          const filters = request.filters as Record<string, any>;

          await this.AffiliateReport({
            id: request.id,
            adminId: request.adminId ?? undefined,
            search: filters.search ?? undefined,
            status: filters.status,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.affiliateCommission: {
          const filters = request.filters as Record<string, any>;

          await this.AffiliateCommissionReport({
            id: request.id,
            adminId: request.adminId ?? undefined,
            status: filters.status,
            search: filters.search,
            fromDate: filters.fromDate?.toISOString(),
            toDate: filters.toDate?.toISOString(),
            format: request.format,
            timezone: request.timezone ?? undefined,
          });
          break;
        }
        case ExportType.transaction: {
          const filters = request.filters as Record<string, any>;
          await this.UserTransactionReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            searchByUserId: BigInt(filters.searchByUserId),
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.bonusStatement: {
          const filters = request.filters as Record<string, any>;

          await this.BonusStatementReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            status: filters.status ?? undefined,
            category: filters.category ?? undefined,
            releaseType: filters.releaseType ?? undefined,
            approvalType: filters.approvalType ?? undefined,
            search: filters.search ?? undefined,
            searchbyuserId: filters.searchbyuserId ?? undefined,
            searchbyusername: filters.searchbyusername ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            timezone: filters.timezone ?? request.timezone ?? undefined,
          });
          break;
        }

        case ExportType.gameTransaction: {
          const filters = request.filters as Record<string, any>;

          await this.UserGameTransactionReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            search: filters.search ?? undefined,
            context: filters.context ?? undefined,
            type: filters.type ?? undefined,
            walletType: filters.walletType ?? undefined,
            format: request.format,
            timezone: request.timezone ?? undefined,
          });

          break;
        }

        case ExportType.activity: {
          const filters = request.filters as Record<string, any>;
          await this.activityReport({
            id: request.id,
            userId: request.userId ?? undefined,
            adminId: request.adminId ?? undefined,
            userType: filters.userType ?? undefined,
            fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
            toDate: filters.toDate ? new Date(filters.toDate) : undefined,
            format: request.format,
            searchByUserId: filters.searchByUserId
              ? Number(filters.searchByUserId)
              : undefined,
            timezone: request.timezone ?? undefined,
          });
          break;
        }

        default:
          throw new Error(`Unsupported export type: ${request.type}`);
      }
    } catch (error) {
      logger.error(`Failed to process export with ID ${request.id}:`, error);
      Sentry.captureException(error);
      await this.prisma.export.update({
        where: { id: request.id },
        data: {
          status: ExportStatus.Failed,
          updatedAt: new Date(),
        },
      });
    }
  }

  async processExportRequest() {
    do {
      const pendingExportRequest = await this.prisma.export.findMany({
        where: {
          status: ExportStatus.Pending,
        },
      });
      if (pendingExportRequest.length > 0) {
        await this.utilsService.batchable(
          pendingExportRequest,
          async (request) => {
            this.logger.info(
              `Processing export ${request.id} of type ${request.type}`,
            );

            await this.processSingleExport(request);
          },
          os.availableParallelism() / 2,
        );
      }
      await this.utilsService.sleep(5000);
    } while (true);

    // setTimeout(() => this.processExportRequest(), 50000);
  }
}
