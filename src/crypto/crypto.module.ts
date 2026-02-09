import { Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { CryptoController } from './crypto.controller';
import { PrismaModule } from 'src/prisma';
import { WalletsModule } from 'src/wallets/wallets.module';
import { UsersModule } from 'src/users';
import { MyWalletModule } from 'src/my-wallet/my-wallet.module';
import { SystemModule } from 'src/system';

@Module({
  imports: [
    PrismaModule,
    WalletsModule,
    UsersModule,
    MyWalletModule,
    SystemModule,
  ],
  controllers: [CryptoController],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
