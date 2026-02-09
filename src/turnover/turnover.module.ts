import { forwardRef, Module } from '@nestjs/common';
import { TurnoverService } from './turnover.service';
import { TurnoverController } from './turnover.controllers';
import { PrismaService } from 'src/prisma';
// import { UserTurnoverAccountService } from './user-turnover-account.service';
import { WalletsModule } from 'src/wallets/wallets.module';
import { WinAmountLockProcessor } from './win-lock-processor.service';
@Module({
  imports: [forwardRef(() => WalletsModule)],
  controllers: [TurnoverController],
  providers: [
    TurnoverService,
    PrismaService,
    // UserTurnoverAccountService
  ],
  exports: [
    TurnoverService,
    //  UserTurnoverAccountService
  ],
})
export class TurnoverModule {}
