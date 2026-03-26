import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { BetResultService } from './bet-result.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BetResultRequest, UnsettleBetMarketRequest } from './dto';
import { ManualRollbackRequest } from './dto/manual-rollback.request';
import {
  AccessGuard,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';
import { CacheTTL } from '@nestjs/cache-manager';
import { CreateUserForResultPanelRequest } from './dto/create-user-for-result-panel.request';

@ApiTags('Bet Result')
@UseFilters(SentryExceptionFilter)
@Controller('bet-result')
export class BetResultController {
  constructor(private readonly betResultService: BetResultService) {}

  @Get('/pending')
  @CacheTTL(1)
  async getPendingBets() {
    const bets = await this.betResultService.getPendingBets();
    return {
      success: true,
      message: 'Pending bet fetched successfully',
      error: false,
      code: 200,
      data: bets,
    };
  }

  @Get('/pending/markets')
  @CacheTTL(500)
  async getPendingBetsMarket(@Query() query: UnsettleBetMarketRequest) {
    const { markets, pagination } =
      await this.betResultService.getUnsattleBetMarket(query);
    return {
      success: true,
      message: 'Pending bet fetched successfully',
      markets,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Post('/declare')
  @Roles(UserType.ResultManager)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  async manualResultDeclare(@Body() body: BetResultRequest) {
    await this.betResultService.manualResult(body);
    return {
      success: true,
      message: 'Bet result recevied successfully',
    };
  }

  @ApiBearerAuth()
  @Post('/manual/rollback')
  @Roles(UserType.ResultManager)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  async manualResultRollback(@Body() body: ManualRollbackRequest) {
    await this.betResultService.manualRollback(body);
    return {
      success: true,
      message: 'Bet result rollbacked successfully',
    };
  }

  @Get('/rollback/markets')
  // @CacheTTL(500)
  async getRollbackPendingBetsMarket(@Query() query: UnsettleBetMarketRequest) {
    const { markets, pagination } =
      await this.betResultService.getSettleResult(query);
    return {
      success: true,
      message: 'Rollback market fetched successfully',
      markets,
      pagination,
    };
  }

  @ApiOperation({ summary: 'Create Result Manager' })
  @ApiBearerAuth()
  @Post('/user')
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  async createUserForResultPanel(
    @Body() body: CreateUserForResultPanelRequest,
  ) {
    const user = await this.betResultService.createUserForResultPanel(body);
    return {
      success: true,
      message: 'User created successfully for result panel',
      user,
    };
  }
}
