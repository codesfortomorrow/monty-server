import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { BetconfigService } from './betconfig.service';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDefaultBetConfigRequest } from './dto';
import {
  AccessGuard,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';

@ApiTags('Bet Config')
@UseFilters(SentryExceptionFilter)
@Controller('betconfig')
export class BetconfigController {
  constructor(private readonly betconfigService: BetconfigService) {}

  @Put('/:eventId')
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  async setBetConfig(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: UpdateDefaultBetConfigRequest,
  ) {
    const betConfig = await this.betconfigService.setBetConfig(
      BigInt(eventId),
      body,
    );
    return {
      success: true,
      message: 'Bet config changed',
      betConfig,
    };
  }
  @Put('/default/betconfig')
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  async updateDefaultBetConfig(@Body() body: UpdateDefaultBetConfigRequest) {
    const betConfig = await this.betconfigService.updateDefaultBetConfig(body);
    return {
      success: true,
      message: 'Default bet config changed',
      betConfig,
    };
  }

  @Get('/:eventId')
  async getBetConfig(@Param('eventId', ParseIntPipe) eventId: number) {
    const betConfig =
      await this.betconfigService.getbetConfigByEventIdOrDefault(
        BigInt(eventId),
      );
    return {
      success: true,
      message: 'Bet config fetched successfully',
      betConfig,
    };
  }

  @Get('/default/betconfig')
  async getDefaultBetConfig() {
    const betConfig = await this.betconfigService.getDefaultBetConfig();
    return {
      success: true,
      message: 'Bet config fetched successfully',
      betConfig,
    };
  }

  @Delete('/:eventId')
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  async deleteBetConfig(@Param('eventId', ParseIntPipe) eventId: number) {
    const betConfig = await this.betconfigService.deleteEventBetConfig(
      BigInt(eventId),
    );
    return {
      success: true,
      message: 'Bet config deleted successfully',
      betConfig,
    };
  }
}
