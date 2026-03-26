import { Module } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueController } from './catalogue.controller';
import { PrismaModule } from 'src/prisma';
import { RedisModule } from 'src/redis';
import { OddsModule } from 'src/odds/odds.module';
import { BetconfigModule } from 'src/betconfig/betconfig.module';
import { MarketModule } from 'src/market/market.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    OddsModule,
    BetconfigModule,
    MarketModule,
  ],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
