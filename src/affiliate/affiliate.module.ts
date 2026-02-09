import { Module } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { AffiliateController } from './affiliate.controller';
import { PrismaModule } from 'src/prisma';
import { WalletsModule } from 'src/wallets/wallets.module';
import { CommissionService } from './commission.service';
import { UsersModule } from 'src/users';
import { AdminModule } from 'src/admin';
import { CommissionProcessor } from './commission.processor';
import { SystemModule } from 'src/system';

@Module({
  imports: [
    PrismaModule,
    WalletsModule,
    UsersModule,
    AdminModule,
    SystemModule,
  ],
  controllers: [AffiliateController],
  providers: [AffiliateService, CommissionService, CommissionProcessor],
  exports: [AffiliateService],
})
export class AffiliateModule {}
