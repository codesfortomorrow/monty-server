import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { WalletsModule } from 'src/wallets/wallets.module';
import { UsersModule } from 'src/users';
import { MyWalletModule } from 'src/my-wallet/my-wallet.module';

@Module({
  imports: [PrismaModule, WalletsModule, UsersModule, MyWalletModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
