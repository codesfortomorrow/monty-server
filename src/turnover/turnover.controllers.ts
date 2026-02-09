import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TurnoverService } from './turnover.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import { GetTurnoverHistoryDto } from './dto';

@ApiTags('Turnover')
@UseFilters(SentryExceptionFilter)
@Controller('turnover')
export class TurnoverController extends BaseController {
  constructor(private readonly turnoverService: TurnoverService) {
    super();
  }

  //   @Post()
  //   @ApiOperation({ summary: 'Create turnover history' })
  //   async createTurnoverHistory(
  //     @Body() body: CreateTurnoverHistoryRequestDto,
  //   ) {
  //     const results = [];

  //     for (const item of body.data) {
  //       results.push(
  //         await this.turnoverService.createTurnoverHistory(item),
  //       );
  //     }

  //     return {
  //       success: true,
  //       count: results.length,
  //       data: results,
  //     };
  //   }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async getUserTurnoverHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetTurnoverHistoryDto,
  ) {
    const ctx = this.getContext(req);
    return this.turnoverService.getUserTurnoverHistory(ctx.user.id, query);
  }
}
