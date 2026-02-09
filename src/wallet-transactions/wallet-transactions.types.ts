// import { UserType } from '@Common';
import { WalletTransactionContext } from '@prisma/client';

// type BaseContextMeta = { userContext: UserType };

type DepositContextMeta = {
  context:
    | typeof WalletTransactionContext.Deposit
    | typeof WalletTransactionContext.CryptoDeposit
    | typeof WalletTransactionContext.SystemDeposit
    | typeof WalletTransactionContext.Bonus
    | typeof WalletTransactionContext.BonusSettlement
    | typeof WalletTransactionContext.DepositBonus
    | typeof WalletTransactionContext.JoiningBonus
    | typeof WalletTransactionContext.LossBackBonus
    | typeof WalletTransactionContext.ReferralBonus
    | typeof WalletTransactionContext.ReferralLossCommissionBonus
    | typeof WalletTransactionContext.PointRemove
    | typeof WalletTransactionContext.PointIssue;
};

type WithdrawalContextMeta = {
  context:
    | typeof WalletTransactionContext.Withdrawal
    | typeof WalletTransactionContext.CryptoWithdrawal
    | typeof WalletTransactionContext.SystemWithdrawal;
};

type BetContextMeta = {
  context:
    | typeof WalletTransactionContext.Bet
    | typeof WalletTransactionContext.BetRefund
    | typeof WalletTransactionContext.Won
    | typeof WalletTransactionContext.Lost
    | typeof WalletTransactionContext.Rollback
    | typeof WalletTransactionContext.CasinoWin
    | typeof WalletTransactionContext.CasinoBet
    | typeof WalletTransactionContext.CasinoBetRefund;
};

export type WalletTransactionContextMeta =
  | DepositContextMeta
  | WithdrawalContextMeta
  | BetContextMeta;
