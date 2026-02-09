import { Controller, Post, UseFilters } from '@nestjs/common';
import { CustomSeedService } from './custom-seed.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Custom Seed')
@UseFilters(SentryExceptionFilter)
@Controller('custom-seed')
export class CustomSeedController {
  constructor(private readonly customSeedService: CustomSeedService) {}

  @ApiOperation({ summary: 'Only For Manual Seed From CSV' })
  @Post()
  async seedCasinoGame() {
    return await this.customSeedService.seedCasinoGamesFromCSV();
  }
}
