import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AccessGuard,
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';
import { SystemService } from './system.service';
import { UpdateSystemSettingsRequestDto } from './dto';
import { get } from 'lodash';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('System')
@UseFilters(SentryExceptionFilter)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AccessGuard)
@Controller('system')
export class SystemController extends BaseController {
  constructor(private readonly systemService: SystemService) {
    super();
  }

  @Get('settings')
  async getAllSettings(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    return this.systemService.getAllSettings(undefined, {
      userContext: ctx.user.type,
    });
  }

  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Patch('settings')
  async updateSettings(@Body() data: UpdateSystemSettingsRequestDto) {
    return await this.systemService.updateSettings(data.data);
  }

  @Get()
  async getTurnoverSettingsDetails() {
    return await this.systemService.getTurnoverSettingsDetails();
  }

  @Get('getconvertionrate')
  async getconvertionrateDetails() {
    return await this.systemService.getconvertionrateDetails();
  }
}
