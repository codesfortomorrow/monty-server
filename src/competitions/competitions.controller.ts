import { Controller, Get, Post, Query, UseFilters } from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { CompetitionsProcessor } from './competitions.processor';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompetitionRequest } from './dto';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Competitions')
@UseFilters(SentryExceptionFilter)
@Controller('competitions')
export class CompetitionsController {
  constructor(
    private readonly competitionsService: CompetitionsService,
    private readonly competitionProcessor: CompetitionsProcessor,
  ) {}

  @ApiOperation({ summary: 'Only For Manual Fetch' })
  @Post('/event/default/provider')
  async fetchCompetitionAndEventsOfDefaultProvider() {
    await this.competitionProcessor.syncDefaultProvider();
    await this.competitionProcessor.fetchRaceMarketCompttionAndEvents();
    return 'Successfully fetched';
  }

  // @ApiOperation({ summary: 'Only For Manual Fetch' })
  // @Post('/other/provider')
  // async fetchCompetitionOfOtherProvider() {
  //   await this.competitionProcessor.handleCompetitionSync();
  //   return 'Successfully fetched';
  // }

  // UI APIs
  @Get()
  async getCompetitions(@Query() query: CompetitionRequest) {
    const competitions = await this.competitionsService.getCompetitions(query);
    return {
      success: true,
      message: 'Competitions fetched successfully',
      competitions,
    };
  }
}
