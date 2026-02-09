import { Module } from '@nestjs/common';
import { FixtureService } from './fixture.service';
import { FixtureController } from './fixture.controller';
import { PrismaModule } from 'src/prisma';
import { RedisModule } from 'src/redis';
import { OddsModule } from 'src/odds/odds.module';

@Module({
  imports: [PrismaModule, RedisModule, OddsModule],
  controllers: [FixtureController],
  providers: [FixtureService],
})
export class FixtureModule {}
