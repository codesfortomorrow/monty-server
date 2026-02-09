import { Module } from '@nestjs/common';
import { BankerService } from './banker.service';
import { BankerController } from './banker.controller';
import { PrismaModule } from 'src/prisma';
import { WalletsModule } from 'src/wallets/wallets.module';
import { WalletTransactionsModule } from 'src/wallet-transactions';
import { CryptoModule } from 'src/crypto';
import { UsersModule } from 'src/users';
// import { BonusModule } from 'src/bonus/bonus.module';
import { AdminModule } from 'src/admin';
import { SystemModule } from 'src/system';

@Module({
  imports: [
    PrismaModule,
    WalletsModule,
    WalletTransactionsModule,
    CryptoModule,
    UsersModule,
    AdminModule,
    SystemModule,
  ],
  controllers: [BankerController],
  providers: [BankerService],
  exports: [BankerService],
})
export class BankerModule {}
