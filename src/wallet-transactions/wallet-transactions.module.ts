import { Module } from '@nestjs/common';
import { WalletTransactionsService } from './wallet-transactions.service';
import { PrismaModule } from '../prisma';
import { WalletTransactionsProcessor } from './wallet-transactions.processor';

@Module({
  imports: [PrismaModule],
  //providers: [WalletTransactionsService],
  providers: [WalletTransactionsService, WalletTransactionsProcessor],
  exports: [WalletTransactionsService],
})
export class WalletTransactionsModule {}
