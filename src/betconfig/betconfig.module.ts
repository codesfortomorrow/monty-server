import { Module } from '@nestjs/common';
import { BetconfigService } from './betconfig.service';
import { BetconfigController } from './betconfig.controller';
import { PrismaModule } from 'src/prisma';
import { RedisModule } from 'src/redis';
import { MarketModule } from 'src/market/market.module';

@Module({
  imports: [PrismaModule, RedisModule, MarketModule],
  controllers: [BetconfigController],
  providers: [BetconfigService],
  exports: [BetconfigService],
})
export class BetconfigModule {}
