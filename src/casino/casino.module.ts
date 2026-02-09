import { Module } from '@nestjs/common';
import { CasinoService } from './casino.service';
import { CasinoController } from './casino.controller';
import { PrismaModule } from 'src/prisma';
import { WalletsModule } from 'src/wallets/wallets.module';
import { CasinoScheduler } from './casino.scheduler';
import { UsersModule } from 'src/users';
import { SportsPermissionModule } from 'src/sports-permission/sports-permission.module';
import { TurnoverModule } from 'src/turnover/turnover.module';
import { SettledCasinoBatchProcessor } from './casino-partnership.processor';

@Module({
  imports: [
    PrismaModule,
    WalletsModule,
    UsersModule,
    SportsPermissionModule,
    TurnoverModule,
  ],
  controllers: [CasinoController],
  providers: [CasinoService, CasinoScheduler, SettledCasinoBatchProcessor],
  exports: [CasinoService],
})
export class CasinoModule {}
