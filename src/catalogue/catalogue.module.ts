import { Module } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueController } from './catalogue.controller';
import { PrismaModule } from 'src/prisma';
import { RedisModule } from 'src/redis';
import { OddsModule } from 'src/odds/odds.module';
import { BetconfigModule } from 'src/betconfig/betconfig.module';

@Module({
  imports: [PrismaModule, RedisModule, OddsModule, BetconfigModule],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
