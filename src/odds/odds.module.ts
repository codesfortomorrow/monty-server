import { Module } from '@nestjs/common';
import { OddsService } from './odds.service';
import { RedisModule } from 'src/redis';
import { PrismaModule } from 'src/prisma';
import { OddsProcessor } from './odds.processor';

@Module({
  imports: [RedisModule, PrismaModule],
  providers: [OddsService, OddsProcessor],
  exports: [OddsService],
})
export class OddsModule {}
