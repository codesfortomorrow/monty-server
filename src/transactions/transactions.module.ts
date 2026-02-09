import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  MeTransactionsController,
  TransactionsController,
} from './controllers';
import { PrismaModule } from 'src/prisma';
import { WalletTransactionsModule } from 'src/wallet-transactions';
import { UsersModule } from 'src/users';

@Module({
  imports: [PrismaModule, WalletTransactionsModule, UsersModule],
  controllers: [TransactionsController, MeTransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
