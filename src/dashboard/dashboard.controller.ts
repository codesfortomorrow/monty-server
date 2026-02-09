import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import {
  AuthenticatedRequest,
  BaseController,
  DateFilterRequest,
  JwtAuthGuard,
} from '@Common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GameAnalyticsRequest, LiveGamesRequest, TopUserRequest } from './dto';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController extends BaseController {
  constructor(private readonly dashboardService: DashboardService) {
    super({ loggerDefaultMeta: { controller: DashboardController.name } });
  }

  @Get('/user-management')
  async getUserManagement(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterRequest,
  ) {
    const ctx = this.getContext(req);
    const userManagement = await this.dashboardService.getUserManagement(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'User management fetched successfully',
      userManagement,
    };
  }

  @Get('/game-analytics')
  async getGameAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query() query: GameAnalyticsRequest,
  ) {
    const ctx = this.getContext(req);
    const gameAnalytics = await this.dashboardService.getGameAnalytics(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Game analytics fetched successfully',
      gameAnalytics,
    };
  }

  @Get('/casino-analytics')
  async getCasinoAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterRequest,
  ) {
    const ctx = this.getContext(req);
    const gameAnalytics = await this.dashboardService.getCasinoAnalytics(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Casino analytics fetched successfully',
      gameAnalytics,
    };
  }

  @Get('/business-analytics')
  async getBusinessAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterRequest,
  ) {
    const ctx = this.getContext(req);
    const businessAnalytics = await this.dashboardService.getBusinessAnalytics(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Business analytics fetched successfully',
      businessAnalytics,
    };
  }

  @Get('/top-users')
  async getTopUsers(
    @Req() req: AuthenticatedRequest,
    @Query() query: TopUserRequest,
  ) {
    const ctx = this.getContext(req);
    const topUsers = await this.dashboardService.getTopUsers(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Top users fetched successfully',
      topUsers,
    };
  }

  @Get('/top-categories')
  async getTopCategories(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterRequest,
  ) {
    const ctx = this.getContext(req);
    const topCategories = await this.dashboardService.getTopCategories(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Top categories fetched successfully',
      topCategories,
    };
  }

  @Get('/device-breakdown')
  async getDeviceBreakdown(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterRequest,
  ) {
    const ctx = this.getContext(req);
    const deviceBreakdown = await this.dashboardService.getDeviceBreakdown(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Device breakdown fetched successfully',
      deviceBreakdown,
    };
  }

  @Get('/bonus-analytics')
  async getBonusAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterRequest,
  ) {
    const ctx = this.getContext(req);
    const bonusAnalytics = await this.dashboardService.getBonusAnalytics(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Bonus analytics fetched successfully',
      bonusAnalytics,
    };
  }

  @Get('/login-summary')
  async getLoginSummary(
    @Req() req: AuthenticatedRequest,
    @Query() query: DateFilterRequest,
  ) {
    const ctx = this.getContext(req);
    const loginSummary = await this.dashboardService.getLoginSummary(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Login summary fetched successfully',
      loginSummary,
    };
  }

  @Get('/balance-summary')
  async getBalanceSummary(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    const balanceSummary = await this.dashboardService.getBalanceSummary(
      ctx.user.id,
      ctx.user.type,
    );
    return {
      success: true,
      message: 'Balance summary fetched successfully',
      balanceSummary,
    };
  }

  @Get('/live-games')
  @CacheTTL(700)
  async getLiveGames(
    @Req() req: AuthenticatedRequest,
    @Query() query: LiveGamesRequest,
  ) {
    const ctx = this.getContext(req);
    const events = await this.dashboardService.getLiveGames(
      ctx.user.id,
      ctx.user.type,
      query,
    );
    return {
      success: true,
      message: 'Live games fetched successfully',
      events,
    };
  }
}
