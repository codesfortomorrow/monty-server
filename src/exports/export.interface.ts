import { UserType } from '@Common';
import {
  AffiliateStatus,
  BetStatusType,
  BonusApplicantStatus,
  BonusApplicantStatusType,
  BonusCategory,
  CommissionStatus,
  ExportFormat,
  ExportType,
  PaymentMode,
  ReleaseType,
  SportType,
  UserStatus,
  WalletTransactionContext,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';
import { MarketType } from 'src/bet-result/dto';
import { DepositCategory } from 'src/bussiness-report/dto';
import { GameType, ReportType } from 'src/reports/dto';
import { RecordType } from 'src/transactions/dto';

export interface DepositWithdrawExportParams {
  id: bigint;
  fromDate?: Date;
  toDate?: Date;
  status?: WalletTransactionStatus;
  type?: WalletTransactionType;
  userId?: bigint;
  adminId?: bigint;
  bankerId?: number;
  isCrypto?: boolean;
  isWalletBank?: boolean;
  paymentMode?: PaymentMode;
  isUpi?: boolean;
  search?: string;
  userType: UserType;
  isAdmin?: boolean;
  isWallet?: boolean;
  isBank?: boolean;
  format: ExportFormat;
  timezone: string;
}

export interface CasinoGameExportParams {
  id: bigint;
  fromDate?: Date;
  toDate?: Date;
  provider?: string;
  category?: string;
  format: ExportFormat;
  search?: string;
  userId?: bigint;
  isExport?: boolean;
  timezone: string;
}

export interface ExportRequest {
  id: bigint;
  format: ExportFormat;
  type: ExportType;
  timezone: string;
}

export interface ExportFilters {
  fromDate?: string | Date;
  toDate?: string | Date;
  status?: string;
  type?: string;
  userId?: string;
  bankerId?: string;
  isCrypto?: boolean;
  isWalletOrBank?: string;
  paymentMode?: string;
  search?: string;
  isAdmin?: boolean;
  isWallet?: boolean;
  isBank?: boolean;
  provider?: string;
  category?: string;
  timezone: string;
}

// enum BetStatusType {
//   PENDING = 'PENDING',
//   WON = 'WON',
//   LOST = 'LOST',
//   VOIDED = 'VOIDED',
//   CANCELLED = 'CANCELLED',
//   ROLLBACK = 'ROLLBACK',
// }
export interface BetHistoryReportParams {
  id: bigint;
  searchByUserName?: string;
  search?: string;
  betId?: number;
  competitionId?: number;
  eventId?: number;
  marketId?: string;
  market?: MarketType;
  status?: BetStatusType;
  searchByUserId?: number;
  sport?: SportType;
  fromDate?: Date;
  toDate?: Date;
  userId?: bigint;
  adminId?: bigint;
  reportType?: ReportType;
  userType?: UserType;
  format: ExportFormat;
  timezone: string;
}

export interface CasinoBetHistoryReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  betId?: number;
  searchByUserName?: string;
  searchByUserId?: number;
  searchByGameId?: number;
  gameId?: number;
  search?: string;
  fromDate?: Date;
  reportType: ReportType;
  toDate?: Date;
  format: ExportFormat;
  status: BetStatusType;
  timezone: string;
}

export interface CasinoPlayerProfitLossReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  searchByUserName?: string;
  searchByUserId?: number;
  reportType: ReportType;
  transactionLimit?: number;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone: string;
}

export interface CasinoDownlineProfitLossReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  searchByUserName?: string;
  searchByUserId?: number;
  reportType?: ReportType;
  transactionLimit?: number;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone: string;
}

export interface PlayerProfitLossReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  searchByUsername?: string;
  transactionLimit?: number;
  searchByUserId?: number;
  reportType?: ReportType;
  sport?: SportType;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone: string;
}

export interface DownlineProfitLossReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  searchByUserName?: string;
  transactionLimit?: number;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone: string;
}

export interface EventProfitLossReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  searchByEvent?: string;
  transactionLimit?: number;
  sport?: SportType;
  gameCategory?: string;
  searchByUserId?: number;
  gameType?: GameType;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone: string;
}

export interface ActivityLogReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  searchByUserId?: number;
  timezone: string;
}
export interface UserTransactionReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType: UserType;
  fromDate?: Date;
  toDate?: Date;
  context?: WalletTransactionContext;
  searchByUserId?: number;
  recordType?: RecordType;
  type?: WalletTransactionType;
  walletType?: WalletType;
  search?: string;
  format: ExportFormat;
  timezone: string;
}

export interface ReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  search: string;
  reportType?: ReportType;
  category?: DepositCategory;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone: string;
}
export interface InactiveUserReportParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  username: string;
  fromDate?: Date;
  status?: UserStatus;
  toDate?: Date;
  level?: number;
  rollId?: number;
  format: ExportFormat;
  timezone: string;
  searchByUserId?: number;
}
export interface ExportAffiliateListParams {
  id: bigint;
  adminId: bigint;
  search?: string;
  status?: AffiliateStatus;
  format: ExportFormat;
  timezone: string;
}
export interface ExportAffiliateCommissionParams {
  id: bigint;
  adminId: bigint;
  search?: string;
  status?: CommissionStatus;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone: string;
}

export interface ExportUserTransactionParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType: UserType;
  searchByUserId: bigint;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone?: string;
}

export interface ExportBonusStatementParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  status?: BonusApplicantStatus; // Pending / Approved / Rejected etc.
  category?: BonusCategory; // Signup / Referral / Cashback etc.
  releaseType?: ReleaseType; // Instant / Scheduled
  search?: string;
  searchbyuserId?: number;
  searchbyusername?: string;
  fromDate?: Date;
  toDate?: Date;
  format: ExportFormat;
  timezone?: string;
}

export interface ExportUserGameTransactionParams {
  id: bigint;
  userId?: bigint;
  adminId?: bigint;
  userType?: UserType;
  fromDate?: Date;
  toDate?: Date;
  context?: WalletTransactionContext;
  type?: WalletTransactionType;
  walletType?: WalletType;
  search?: string;
  format: ExportFormat;
  timezone?: string;
}
