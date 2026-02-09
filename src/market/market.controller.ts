import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketProcessor } from './market.processor';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  MarketInsertRequest,
  MarketRequest,
  MarketStatusChangeRequest,
  UpdateMarketBetSetting,
} from './dto';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Market')
@UseFilters(SentryExceptionFilter)
@Controller('market')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly marketProcessor: MarketProcessor,
  ) {}

  @ApiOperation({ summary: 'Only For Manual Insert' })
  @Post('/insert/manually')
  async insertMarketManually(@Query() query: MarketInsertRequest) {
    await this.marketProcessor.syncMarkets(query.sport);
    await this.marketProcessor.syncRaceMarkets();
    return 'Successfully insert market data manually';
  }

  // UI APIs
  @Get()
  async getMarkets(@Query() query: MarketRequest) {
    const markets = await this.marketService.getMarkets(query);
    return {
      success: true,
      message: 'Markets fetched successfully',
      markets,
    };
  }

  @Get('/:id')
  async getMarketById(@Param('id', ParseIntPipe) id: number) {
    const market = await this.marketService.getById(id);
    return {
      success: true,
      message: 'Market fetched successfully',
      market,
    };
  }

  @Get('/runner/:eventId/:marketId')
  async getMarketRunner(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('marketId') marketId: string,
  ) {
    const marketRunners =
      await this.marketService.getRunnerByEventIdAndExternalId(
        eventId,
        marketId,
      );
    return {
      success: true,
      message: 'Market runner fetched successfully',
      marketRunners,
    };
  }

  // Market Management
  @Patch('status/:id')
  async changeMarketStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: MarketStatusChangeRequest,
  ) {
    const market = await this.marketService.changeMarketStatus(
      BigInt(id),
      body.status,
    );
    return {
      success: true,
      message: 'Market status changed successfully',
      market,
    };
  }
  @Patch('/:id')
  async updateMarketSetting(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMarketBetSetting,
  ) {
    const market = await this.marketService.updateBetSetting(BigInt(id), body);
    return {
      success: true,
      message: 'Market bet setting updated successfully',
      market,
    };
  }
}
