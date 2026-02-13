import { Controller, Get } from '@nestjs/common';
import { SportsOrchestratorProcessorService } from './sports-orchestrator-processor.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Sports Orchestrator')
@Controller('sports-orchestrator')
export class SportsOrchestratorController {
  constructor(
    private readonly sportsOrchestratorService: SportsOrchestratorProcessorService,
  ) {}

  @ApiOperation({ summary: 'Only For Manual Sports Data Sync' })
  @Get()
  async syncSports() {
    const res = await this.sportsOrchestratorService.manualRun();
    return {
      success: true,
      message: res,
    };
  }
}
