import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from 'src/prisma';
import { UsersModule } from 'src/users';
import { WalletsModule } from 'src/wallets/wallets.module';
import { OddsModule } from 'src/odds/odds.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, UsersModule, WalletsModule, OddsModule, HttpModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
