import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from 'src/prisma';
import { BankController } from './bank.controller';
import { BankService } from './bank.service';
import { UsersModule } from 'src/users';
import { WalletsModule } from 'src/wallets/wallets.module';

@Module({
  imports: [PrismaModule, UsersModule, WalletsModule],
  controllers: [BankController],
  providers: [BankService, PrismaService],
  exports: [BankService],
})
export class BankModule {}
