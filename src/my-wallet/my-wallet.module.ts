import { Module } from '@nestjs/common';
import { MyWalletService } from './my-wallet.service';
import { MyWalletController } from './my-wallet.controller';
import { PrismaModule } from 'src/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [MyWalletController],
  providers: [MyWalletService],
  exports: [MyWalletService],
})
export class MyWalletModule {}
