import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { SportsPermissionService } from './sports-permission.service';
import { UpdateSportsPermissionRequest } from './dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';

@ApiTags('Sports Permission')
@UseFilters(SentryExceptionFilter)
@Controller('sports-permission')
export class SportsPermissionController extends BaseController {
  constructor(
    private readonly sportsPermissionService: SportsPermissionService,
  ) {
    super({
      loggerDefaultMeta: { controller: SportsPermissionController.name },
    });
  }

  @ApiBearerAuth()
  @Put('/:userId')
  @UseGuards(JwtAuthGuard)
  async updateSportsPermission(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateSportsPermissionRequest,
  ) {
    const ctx = this.getContext(req);
    const permission =
      await this.sportsPermissionService.updateSportsPermission(
        userId,
        body,
        ctx.user.id,
        ctx.user.type,
      );
    return {
      success: true,
      message: 'Sports permission updated successfully',
      permission,
    };
  }

  @Get('/:userId')
  async getSportsPermission(@Param('userId', ParseIntPipe) userId: number) {
    const permission =
      await this.sportsPermissionService.getSportsPermission(userId);
    return {
      success: true,
      message: 'Sports permission fetched successfully',
      permission,
    };
  }
}
