import { Module } from '@nestjs/common';
import { MarketMapperService } from './market-mapper.service';

@Module({
  providers: [MarketMapperService],
  exports: [MarketMapperService],
})
export class MarketMapperModule {}
