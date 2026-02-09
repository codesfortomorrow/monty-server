import { Module } from '@nestjs/common';
import { SportsOrchestratorProcessorService } from './sports-orchestrator-processor.service';
import { CompetitionsModule } from 'src/competitions/competitions.module';
import { EventsModule } from 'src/events/events.module';
import { MarketModule } from 'src/market/market.module';
import { SportsOrchestratorController } from './sports-orchestrator.controller';

@Module({
  imports: [CompetitionsModule, EventsModule, MarketModule],
  controllers: [SportsOrchestratorController],
  providers: [SportsOrchestratorProcessorService],
})
export class SportsOrchestratorProcessorModule {}
