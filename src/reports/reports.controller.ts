import {
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
import { ReportsService } from './reports.service';
import {
  BetReportsRequest,
  CasinoBetReportsRequest,
  CasinoProfitLossReportsRequest,
  DownlineProfitLossRequest,
  EventProfitLossRequest,
  PlayerProfitLossRequest,
} from './dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';

@ApiTags('Reports')
@UseFilters(SentryExceptionFilter)
@Controller('reports')
export class ReportsController extends BaseController {
  constructor(private readonly reportsService: ReportsService) {
    super();
  }

  @ApiBearerAuth()
  @Get('/bet')
  @UseGuards(JwtAuthGuard)
  async betReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: BetReportsRequest,
  ) {
    const ctx = this.getContext(req);
    const { bets, pagination } = await this.reportsService.getBetReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Bet reports fetched successfully',
      bets,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/downline/profitloss/:userId')
  @UseGuards(JwtAuthGuard)
  async downlineProfitLossByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: DownlineProfitLossRequest,
  ) {
    const {
      downlineUsers,
      pagination,
      totals,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    } = await this.reportsService.getDownlineProfitLoss(
      userId,
      UserType.User,
      query.path,
      query,
    );
    return {
      success: true,
      message: 'Downline profit loss reports fetched successfully',
      downlineUsers,
      totals,
      pagination,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    };
  }

  @ApiBearerAuth()
  @Get('/downline/profitloss')
  @UseGuards(JwtAuthGuard)
  async downlineProfitLoss(
    @Req() req: AuthenticatedRequest,
    @Query() query: DownlineProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    const {
      downlineUsers,
      pagination,
      totals,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    } = await this.reportsService.getDownlineProfitLoss(
      ctx.user.id,
      ctx.user.type,
      ctx.user.path,
      query,
    );
    return {
      success: true,
      message: 'Downline profit loss reports fetched successfully',
      downlineUsers,
      totals,
      pagination,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    };
  }

  @ApiBearerAuth()
  @Get('/event/profitloss')
  @UseGuards(JwtAuthGuard)
  async eventProfitLoss(
    @Req() req: AuthenticatedRequest,
    @Query() query: EventProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    const { eventRows: eventProfitLoss, pagination } =
      await this.reportsService.getEventProfitLossReport(
        query.userId ? BigInt(query.userId) : ctx.user.id,
        query.userId ? UserType.User : ctx.user.type,
        query,
      );
    return {
      success: true,
      message: 'Event profit loss reports fetched successfully',
      eventProfitLoss,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/event/profitloss/:userId')
  @UseGuards(JwtAuthGuard)
  async eventProfitLossByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: EventProfitLossRequest,
  ) {
    const { eventRows: eventProfitLoss, pagination } =
      await this.reportsService.getEventProfitLossReport(
        BigInt(userId),
        UserType.User,
        query,
      );
    return {
      success: true,
      message: 'Event profit loss reports fetched successfully',
      eventProfitLoss,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/market/profitloss/:eventId')
  @UseGuards(JwtAuthGuard)
  async marketProfitLoss(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Req() req: AuthenticatedRequest,
    @Query() query: EventProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    const { markets: marketProfitLoss, pagination } =
      await this.reportsService.getMarketProfitLossReport(
        query.userId ? BigInt(query.userId) : ctx.user.id,
        query.userId ? UserType.User : ctx.user.type,
        eventId,
        query,
      );
    return {
      success: true,
      message: 'Market profit loss reports fetched successfully',
      marketProfitLoss,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/market/profitloss/:eventId/:userId')
  @UseGuards(JwtAuthGuard)
  async marketProfitLossByUserId(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: EventProfitLossRequest,
  ) {
    const { markets: marketProfitLoss, pagination } =
      await this.reportsService.getMarketProfitLossReport(
        BigInt(userId),
        UserType.User,
        eventId,
        query,
      );
    return {
      success: true,
      message: 'Market profit loss reports fetched successfully',
      marketProfitLoss,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/player/profitloss')
  @UseGuards(JwtAuthGuard)
  async playerProfitLoss(
    @Req() req: AuthenticatedRequest,
    @Query() query: PlayerProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    const {
      users: playerProfitLoss,
      pagination,
      totalProfitLoss,
    } = await this.reportsService.getPlayerProfitLoss(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Player profit loss reports fetched successfully',
      playerProfitLoss,
      totalProfitLoss,
      pagination,
    };
  }

  // Casino
  @ApiBearerAuth()
  @Get('/casino-bet')
  @UseGuards(JwtAuthGuard)
  async casinobetReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: CasinoBetReportsRequest,
  ) {
    const ctx = this.getContext(req);
    const { casinoBets, pagination } =
      await this.reportsService.casinoBetReport(
        ctx.user.id,
        ctx.user.type,
        query,
      );
    return {
      success: true,
      message: 'Bet reports fetched successfully',
      casinoBets,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/casino/downline/profitloss')
  @UseGuards(JwtAuthGuard)
  async casinoProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: CasinoProfitLossReportsRequest,
  ) {
    const ctx = this.getContext(req);
    const {
      downlineUsers,
      pagination,
      totals,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    } = await this.reportsService.getCasinoDownlineProfitLoss(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Profit/Loss reports fetched successfully',
      downlineUsers,
      totals,
      pagination,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    };
  }

  @ApiBearerAuth()
  @Get('/casino/downline/profitloss/:userId')
  @UseGuards(JwtAuthGuard)
  async casinoProfitLossReportsByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: CasinoProfitLossReportsRequest,
  ) {
    const {
      downlineUsers,
      pagination,
      totals,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    } = await this.reportsService.getCasinoDownlineProfitLoss(
      userId,
      UserType.User,
      query,
    );
    return {
      success: true,
      message: 'Profit/Loss reports fetched successfully',
      downlineUsers,
      totals,
      pagination,
      totalClientPl,
      totalUplinePl,
      totalDownlinePl,
    };
  }

  @ApiBearerAuth()
  @Get('/casino/player/profitloss')
  @UseGuards(JwtAuthGuard)
  async casinoPlayerProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: CasinoProfitLossReportsRequest,
  ) {
    const ctx = this.getContext(req);
    const { casinoProfitLoss, pagination, totals } =
      await this.reportsService.playerCasinoProfitReport(
        ctx.user.id,
        ctx.user.type,
        query,
      );
    return {
      success: true,
      message: 'Profit/Loss reports fetched successfully',
      casinoProfitLoss,
      totals,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Post('/export-bet/report')
  @UseGuards(JwtAuthGuard)
  async exportBetReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: BetReportsRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.reportsService.exportBetReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-casino/bet-report')
  @UseGuards(JwtAuthGuard)
  async exportCasinoBetReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: CasinoBetReportsRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.reportsService.exportCasinoBetReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-downline/profit-loss')
  @UseGuards(JwtAuthGuard)
  async exportDownlineProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: DownlineProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    return this.reportsService.exportDownlineProfitLossReports(
      ctx.user.id,
      ctx.user.type,
      query.path || String(ctx.user.path),
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-event/profit-loss')
  @UseGuards(JwtAuthGuard)
  async exportEventProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: EventProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.reportsService.exportEventProfitLossReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-player/profit-loss')
  @UseGuards(JwtAuthGuard)
  async exportPlayerProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: PlayerProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.reportsService.exportPlayerProfitLossReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-casino/downline')
  @UseGuards(JwtAuthGuard)
  async exportCasinoDownlineProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: DownlineProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.reportsService.exportCasinoDownlineProfitLossReports(
      ctx.user.id,
      ctx.user.type,
      query.path || String(ctx.user.path),
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-casino/player/profit-loss')
  @UseGuards(JwtAuthGuard)
  async exportCasinoPlayerProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: CasinoProfitLossReportsRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.reportsService.exportCasinoPlayerProfitLossReports(
      ctx.user.id,
      ctx.user.type,
      query.path || String(ctx.user.path),
      query,
    );
  }
}
