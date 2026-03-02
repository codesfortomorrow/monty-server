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
import { BetService } from './bet.service';
import { BetHistoryRequest, BetPlaceRequest, DownlineBetsRequest } from './dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import { BetProfitLossRequest } from './dto/bet-profit-loss.request';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Bet')
@UseFilters(SentryExceptionFilter)
@Controller('bet')
export class BetController extends BaseController {
  constructor(private readonly betService: BetService) {
    super();
  }

  @ApiBearerAuth()
  @Post('/place')
  @UseGuards(JwtAuthGuard)
  async betPlace(
    @Req() req: AuthenticatedRequest,
    @Body() body: BetPlaceRequest,
  ) {
    console.log(body.acceptOddsChange);
    const ctx = this.getContext(req);
    const ip = this.getIp(req);
    const bet = await this.betService.placeBet(ctx.user.id, body, ip);
    return {
      success: true,
      message: 'Bet placed successfully',
      bet,
    };
  }

  @ApiBearerAuth()
  @Get('/history')
  @UseGuards(JwtAuthGuard)
  @CacheTTL(700)
  async betHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: BetHistoryRequest,
  ) {
    const ctx = this.getContext(req);
    const { bets, pagination } = await this.betService.getBetHistory(
      ctx.user.id,
      query,
    );
    return {
      success: true,
      message: 'Bet history fetched successfully',
      bets,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/profit-loss')
  @UseGuards(JwtAuthGuard)
  async betingProfitLoss(
    @Req() req: AuthenticatedRequest,
    @Query() query: BetProfitLossRequest,
  ) {
    const ctx = this.getContext(req);
    const { bets, pagination, filteredProfitLoss, totalProfitLossAllSports } =
      await this.betService.betProfitLoss(ctx.user.id, query);
    return {
      success: true,
      message: 'Bet profit/loss fetched successfully',
      bets,
      pagination,
      filteredProfitLoss,
      totalProfitLossAllSports,
    };
  }

  // Downline Bet List
  @ApiBearerAuth()
  @Get('/downline/:eventId')
  @UseGuards(JwtAuthGuard)
  async getDownlineBets(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Req() req: AuthenticatedRequest,
    @Query() query: DownlineBetsRequest,
  ) {
    const ctx = this.getContext(req);
    const { bets, pagination } = await this.betService.getDownlineBets(
      eventId,
      ctx.user.path,
      query,
    );
    return {
      success: true,
      message: 'Bets fetched successfully',
      bets,
      pagination,
    };
  }
}
