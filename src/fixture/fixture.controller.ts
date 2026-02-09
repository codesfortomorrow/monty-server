import { Controller, Get, Query, UseFilters } from '@nestjs/common';
import { FixtureService } from './fixture.service';
import { FixtureRequest } from './dto';
import { ApiTags } from '@nestjs/swagger';
import { SentryExceptionFilter } from '@Common';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Fixture')
@Controller('fixture')
export class FixtureController {
  constructor(private readonly fixtureService: FixtureService) {}

  @UseFilters(SentryExceptionFilter)
  @Get()
  @CacheTTL(5000)
  async getFixture(@Query() query: FixtureRequest) {
    const fixture = await this.fixtureService.getFixtureDetails(query, true);
    return {
      success: true,
      message: 'Fixture fetched successfully',
      fixture,
    };
  }

  @UseFilters(SentryExceptionFilter)
  @Get('race')
  @CacheTTL(1000)
  async getRaceFixture(@Query() query: FixtureRequest) {
    const fixture = await this.fixtureService.getFixtureDetails(query, false);
    return {
      success: true,
      message: 'Fixture fetched successfully',
      fixture,
    };
  }
}
