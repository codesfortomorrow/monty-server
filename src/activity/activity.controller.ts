import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import {
  AuthenticatedRequest,
  BaseController,
  DateFilterWithPaginationRequest,
  JwtAuthGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { activityLogDto } from './dto';

//@UseFilters(SentryExceptionFilter)
@Controller('activity-log')
export class ActivityController extends BaseController {
  constructor(private readonly activityService: ActivityService) {
    super();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async getactivity(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterWithPaginationRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.activityService.getByUserId(userId, ctx.user.type, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':userId')
  async getactivityByuserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: DateFilterWithPaginationRequest,
  ) {
    return await this.activityService.getByUserId(
      BigInt(userId),
      UserType.User,
      query,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('export')
  async exportActivity(
    @Req() req: AuthenticatedRequest,
    @Query() query: activityLogDto,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.activityService.exportActivityReports(
      userId,
      ctx.user.type,
      query,
    );
  }
}
