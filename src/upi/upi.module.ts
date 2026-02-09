import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from 'src/prisma';
import { UpiController } from './upi.controller';
import { UpiService } from './upi.service';
import { UsersModule } from 'src/users';
import { WalletsModule } from 'src/wallets/wallets.module';

@Module({
  imports: [PrismaModule, UsersModule, WalletsModule],
  controllers: [UpiController],
  providers: [UpiService, PrismaService],
  exports: [UpiService],
})
export class UpiModule {}
