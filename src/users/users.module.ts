import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma';
import { OtpModule } from '../otp';
import { WalletsModule } from 'src/wallets/wallets.module';
import { AdminModule } from 'src/admin';
// import { BonusModule } from 'src/bonus/bonus.module';

@Module({
  imports: [
    PrismaModule,
    OtpModule,
    WalletsModule,
    AdminModule,
    // BonusModule
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
