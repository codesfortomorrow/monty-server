import { forwardRef, Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { MeWalletsController, UserWalletsController } from './controllers';
import { PrismaModule } from '../prisma';
import { WalletTransactionsModule } from '../wallet-transactions';
import { ExposureModule } from 'src/exposure/exposure.module';
// import { BonusModule } from 'src/bonus/bonus.module';
import { TurnoverModule } from 'src/turnover/turnover.module';
import { MyWalletModule } from 'src/my-wallet/my-wallet.module';
// import { PaymentsModule } from '../payments';

@Module({
  imports: [
    PrismaModule,
    WalletTransactionsModule,
    ExposureModule,
    // forwardRef(() => BonusModule),
    TurnoverModule,
    MyWalletModule,
  ], // PaymentsModule
  controllers: [MeWalletsController, UserWalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
