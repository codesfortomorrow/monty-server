import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseFilters,
} from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueRequest } from './dto';
import { ApiTags } from '@nestjs/swagger';
import { SentryExceptionFilter } from '@Common';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Catalogue')
@UseFilters(SentryExceptionFilter)
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get('/:eventId')
  @CacheTTL(500)
  async getCatalogue(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: CatalogueRequest,
  ) {
    const { catalogue, betConfig } =
      await this.catalogueService.getCatalogueDetails(eventId, query);
    return {
      success: true,
      message: 'Catalogue fetched successfully',
      catalogue,
      betConfig,
    };
  }

  @Get('market/:eventId')
  async getMarketCatalogue(
    @Param('eventId', ParseIntPipe) eventId: number,

    @Query() query: CatalogueRequest,
  ) {
    const catalogue = await this.catalogueService.getMarketCatalogue(
      eventId,
      query,
    );
    return {
      success: true,
      message: 'Catalogue fetched successfully',
      catalogue,
    };
  }
}
