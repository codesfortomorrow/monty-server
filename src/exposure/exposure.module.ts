import { forwardRef, Module } from '@nestjs/common';
import { ExposureService } from './exposure.service';
import { ExposureController } from './exposure.controller';
import { PrismaModule } from 'src/prisma';
import { RedisModule } from 'src/redis';
import { MarketModule } from 'src/market/market.module';
import { UsersModule } from 'src/users';
import { UplineExposureBatchProcessor } from './upline-exposure.processor';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    MarketModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [ExposureController],
  providers: [ExposureService, UplineExposureBatchProcessor],
  exports: [ExposureService],
})
export class ExposureModule {}
