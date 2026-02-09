import { forwardRef, Module } from '@nestjs/common';
import { BonusService } from './bonus.service';
import { BonusController } from './bonus.controller';
import { PrismaModule } from 'src/prisma';
import { BonusCategoryPayloadValidatorService } from './validators/bonus-category-payload.validator';
// import { BonusCalculationService } from './services/bonus-calculation.service';
import { WalletsModule } from 'src/wallets/wallets.module';
import { TurnoverModule } from 'src/turnover/turnover.module';
// import { UserTurnoverAccountService } from 'src/turnover/user-turnover-account.service';
// import { BonusUtilizationService } from './services/bonus-utilization.service';
import { BonusDepositProcessor } from './services/process-bonus-ondeposit.service';
import { WalletTransactionsModule } from 'src/wallet-transactions';
import { BonusProcessor } from './services/bonus.internal.processor';

@Module({
  imports: [
    PrismaModule,
    TurnoverModule,
    forwardRef(() => WalletsModule),
    WalletTransactionsModule,
  ],
  controllers: [BonusController],
  providers: [
    BonusService,
    BonusCategoryPayloadValidatorService,
    BonusProcessor,
    // BonusCalculationService,
    // UserTurnoverAccountService,
    // BonusUtilizationService,
    BonusDepositProcessor,
  ],
  exports: [
    BonusProcessor,
    //  BonusUtilizationService,
    BonusService,
  ],
})
export class BonusModule {}
