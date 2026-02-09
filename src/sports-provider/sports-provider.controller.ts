import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseFilters,
} from '@nestjs/common';
import { SportsProviderService } from './sports-provider.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateSportsProviderRequest } from './dto';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Sports Provider Management')
@UseFilters(SentryExceptionFilter)
@Controller('sports-provider')
export class SportsProviderController {
  constructor(private readonly sportsProviderService: SportsProviderService) {}

  @ApiOperation({ summary: 'Only For Manual Insert' })
  @Post('/insert')
  async insertProvider() {
    return await this.sportsProviderService.insertProvider();
  }

  @Post()
  async addProvider(@Body() body: CreateSportsProviderRequest) {
    return await this.sportsProviderService.create(body);
  }

  @Get()
  async getAllProvider() {
    return await this.sportsProviderService.findAll();
  }

  @Delete('/:id')
  async deleteProvider(@Param('id', ParseIntPipe) id: number) {
    return await this.sportsProviderService.remove(id);
  }
}
