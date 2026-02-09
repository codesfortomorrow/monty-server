import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CasinoService } from './casino.service';
import {
  AccessGuard,
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import {
  AddToFavoriteCasino,
  CasinoBalanceRequest,
  // CasinoCreditRequest,
  // CasinoDebitRequest,
  // CasinoGameListBody,
  CasinoHistoryExportRequest,
  CasinoHistoryRequest,
  CasinoProfitLossRequest,
  // CasinoRollbackRequest,
  ChangeProviderStatusRequest,
  ChangeStatus,
  CreatesessionPayload,
  exportCasinoGamesPayload,
  FavoriteCasinoGames,
  GetCasinoCategoryPayload,
  GetCasinoGamesPayload,
  GetCasinoProviderRequest,
  GetTrendingGame,
  MostPlayedGameRequest,
  RecentGamesRequest,
  UpdateCasinoGame,
} from './dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
// import { ExportFormat } from '@prisma/client';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Casino')
@UseFilters(SentryExceptionFilter)
@Controller('casino')
export class CasinoController extends BaseController {
  constructor(private readonly casinoService: CasinoService) {
    super();
  }

  @ApiOperation({ summary: 'Only For Manual Insert Casino from Operator' })
  @Get('/operator/get-games-list')
  async insertCasinoGames() {
    const casinos = await this.casinoService.insertCasinoGames();
    return casinos;
  }

  // @Get('/games')
  // async liveCasinoGame(@Query() query: GetCasinoGamesPayload) {
  //   const { search, userId, provider, category, status, limit, page } = query;

  //   const { games, pagination } = await this.casinoService.liveCasinoGames(
  //     search?.trim(),
  //     userId,
  //     limit ? Number(limit) : undefined,
  //     page ? Number(page) : undefined,
  //     provider?.trim(),
  //     category?.trim(),
  //     status,
  //   );

  //   return {
  //     success: true,
  //     message: 'Casino games fetched successfully',
  //     games,
  //     pagination,
  //   };
  // }
  @Get('/games')
  async liveCasinoGame(@Query() query: GetCasinoGamesPayload) {
    const { games, pagination } =
      await this.casinoService.liveCasinoGames(query);

    return {
      success: true,
      message: 'Casino games fetched successfully',
      games,
      pagination,
    };
  }
  @Get('/category')
  async casinoGameCategory(@Query() query: GetCasinoCategoryPayload) {
    const { search, provider } = query;

    const categories = await this.casinoService.casinoGameCategory(
      search?.trim(),
      provider?.trim(),
    );

    return categories;
  }

  @ApiBearerAuth()
  @Post('/create-session/:id')
  @UseGuards(JwtAuthGuard)
  async createCasinoSession(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreatesessionPayload,
  ) {
    const ip = this.getIp(req);
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    const result = await this.casinoService.createCasinoSession(
      body.platform,
      id,
      userId,
      ip || '',
    );

    return result;
  }

  @Post('/balance')
  async casinoBalance(@Body() body: CasinoBalanceRequest) {
    if (body.PartnerId != process.env.GAP_OPERATOR_ID) {
      throw new HttpException('Invalid operator ID', HttpStatus.FORBIDDEN);
    }
    const userbalance = await this.casinoService.casinoBalance(body.userId);
    if (userbalance.success) {
      const response = {
        status: 'OP_SUCCESS',
        balance: userbalance.updatedBalance,
      };
      return response;
    }
    return userbalance;
  }

  @Post('/betrequest')
  async handleDebitCallback(@Body() body: any) {
    // CasinoDebitRequest
    const {
      PartnerId,
      userId,
      reqId,
      transactionId,
      gameId,
      roundId,
      debitAmount,
      // betType,
    } = body;

    if (!reqId || !transactionId || !gameId || !roundId) {
      throw new BadRequestException({
        status: 'OP_INVALID_PARAMS',
        message: 'Invalid Params',
      });
    }

    if (PartnerId != process.env.GAP_OPERATOR_ID) {
      throw new ForbiddenException('Invalid operator ID');
    }

    const updatedBalance = await this.casinoService.handleDebitCallback(
      BigInt(Number(userId)),
      reqId,
      transactionId,
      gameId,
      roundId,
      debitAmount,
    );
    return updatedBalance;
  }

  @Post('/resultrequest')
  async handlecreditCallback(@Body() body: any) {
    // CasinoCreditRequest
    const {
      PartnerId,
      userId,
      reqId,
      transactionId,
      gameId,
      roundId,
      creditAmount,
      // betType,
    } = body;

    if (!reqId || !transactionId || !gameId || !roundId) {
      throw new BadRequestException({
        status: 'OP_INVALID_PARAMS',
        message: 'Invalid Params',
      });
    }

    if (PartnerId !== process.env.GAP_OPERATOR_ID) {
      throw new ForbiddenException('Invalid operator ID');
    }

    const updatedBalance = await this.casinoService.handleCreditCallback(
      BigInt(Number(userId)),
      reqId,
      transactionId,
      gameId,
      roundId,
      creditAmount,
    );

    if (updatedBalance.success && updatedBalance.updatedUserBalance) {
      const response = {
        status: 'OP_SUCCESS',
        balance: updatedBalance.updatedUserBalance,
      };
      return response;
    }

    return updatedBalance;
  }

  @Post('/rollbackrequest')
  async casinoRollbackRequest(@Body() body: any) {
    // CasinoRollbackRequest
    const {
      PartnerId,
      userId,
      reqId,
      transactionId,
      gameId,
      roundId,
      rollbackAmount,
      // betType,
      rollbackReason,
    } = body;

    if (
      !reqId ||
      !transactionId ||
      !gameId ||
      !roundId ||
      !rollbackAmount ||
      !rollbackReason
    ) {
      throw new BadRequestException({
        status: 'OP_INVALID_PARAMS',
        message: 'Invalid Params',
      });
    }

    if (PartnerId !== process.env.GAP_OPERATOR_ID) {
      throw new ForbiddenException('Invalid operator ID');
    }

    const updatedBalance = await this.casinoService.casinoRollbackRequest(
      Number(userId),
      reqId,
      transactionId,
      gameId,
      roundId,
      rollbackAmount,
      rollbackReason,
    );

    if (updatedBalance.success && updatedBalance.updatedUserBalance) {
      const response = {
        status: 'OP_SUCCESS',
        balance: updatedBalance.updatedUserBalance,
      };
      return response;
    }
    return updatedBalance;
  }

  @ApiBearerAuth()
  @Patch('/trending/:id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async changeTrendingStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeStatus,
  ) {
    const casino = await this.casinoService.changeTrendingStatus(
      id,
      body.status === 'ACTIVE',
    );

    return {
      success: true,
      message: 'Casino Game updated successfully',
      casino,
    };
  }

  @Get('/trending')
  async getTrendingGames(@Query() query: GetTrendingGame) {
    const casinos = await this.casinoService.getTrendingCasinos(query.status);
    return {
      success: true,
      message: 'Casino games fecthed successfully',
      casinos,
    };
  }

  @ApiBearerAuth()
  @Patch('/status/:id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async cahngeCasinoStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeStatus,
  ) {
    const casino = await this.casinoService.changeCasinoStatus(id, body.status);
    return {
      success: true,
      message: 'Casino game updated successfully',
      casino,
    };
  }

  @ApiBearerAuth()
  @Put('/favorite/:id')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async addToFavoriteCasino(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Body() body: AddToFavoriteCasino,
  ) {
    const ctx = this.getContext(req);
    const result = await this.casinoService.addToFavoriteCasinoGame(
      Number(id),
      ctx.user.id,
      body.status,
    );
    return {
      message:
        body.status === 'FAVORITE'
          ? 'Game added to favorite list'
          : 'Game removed from fevorite list',
      data: result,
    };
  }

  @ApiBearerAuth()
  @Get('/favorite')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async getAllFavoriteCasinoGames(
    @Req() req: AuthenticatedRequest,
    @Query() query: FavoriteCasinoGames,
  ) {
    const ctx = this.getContext(req);
    const { games, pagination } =
      await this.casinoService.getUserFavoriteCasinoGames(
        ctx.user.id,
        query.page,
        query.limit,
      );
    return {
      message: 'Favorite games fetched successfully',
      games,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Get('/recent')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async getRecentGames(
    @Req() req: AuthenticatedRequest,
    @Query() query: RecentGamesRequest,
  ) {
    const ctx = this.getContext(req);
    const games = await this.casinoService.getRecentlyPlayedGames(
      ctx.user.id,
      query.limit,
    );
    return {
      success: true,
      message: 'Recent games fetched successfully',
      games,
    };
  }

  @Get('/most-played')
  async getMostPlayedGames(@Query() query: MostPlayedGameRequest) {
    const games = await this.casinoService.getMostPlayedGame(query.userId);
    return {
      success: true,
      message: 'Most played games fetched successfully',
      games,
    };
  }

  @ApiBearerAuth()
  @Get('round/history')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async getRoundHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: CasinoHistoryRequest,
  ) {
    const ctx = this.getContext(req);
    const { rounds, pagination } = await this.casinoService.getRoundHistory(
      ctx.user.id,
      ctx.user.type,
      query,
    );

    return {
      success: true,
      message: 'Round history fetched successfully',
      rounds,
      pagination,
    };
  }
  @CacheTTL(1)
  @Get('/providers')
  async casinoGameProvider(@Query() query: GetCasinoProviderRequest) {
    const { providers, pagination } =
      await this.casinoService.casinoGameProvider(
        query.aggregator?.trim(),
        query.search?.trim(),
        query.page,
        query.limit,
      );
    return {
      success: true,
      message: 'Provider fetched successfully',
      providers,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Patch('/provider/status')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async changeProviderStatus(@Body() body: ChangeProviderStatusRequest) {
    const providerWithStatus = await this.casinoService.changeProviderStatus(
      body.provider,
      body.status,
    );
    return {
      success: true,
      message: 'Provider status changed successfully',
      provider: providerWithStatus,
    };
  }

  @Patch('/:id')
  async updateCasinoGame(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCasinoGame,
  ) {
    const game = await this.casinoService.updateCasinoGame(Number(id), body);
    return {
      success: true,
      message: 'Casino game updated susscessfully',
      casino: game,
    };
  }

  @ApiBearerAuth()
  @Get('round/export-history')
  @UseGuards(JwtAuthGuard, AccessGuard)
  async exportRoundHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: CasinoHistoryExportRequest,
  ) {
    const ctx = this.getContext(req);

    return await this.casinoService.exportCasinoRountReport(
      ctx.user.id,
      ctx.user.type,
      ctx.user.path,
      query,
    );
  }

  @Get('/export-games')
  async exportliveCasinoGameExport(@Query() query: exportCasinoGamesPayload) {
    return await this.casinoService.exportCasinoGameReport(query);
  }

  @Get('/profit/loss/:userId')
  async getCasinoProfitLossByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: CasinoProfitLossRequest,
  ) {
    const casinoProfitLoss = await this.casinoService.casinoProfitLossByUserId(
      userId,
      query,
    );
    return {
      success: true,
      message: 'Casino profit/loss fetched successfully',
      casinoProfitLoss,
    };
  }

  @Get('/:id')
  async getGameById(@Param('id', ParseIntPipe) id: number) {
    const game = await this.casinoService.getGameById(id);
    return {
      success: true,
      message: 'Game fetched succssfully',
      game,
    };
  }

  @Get('/static/games')
  async getStaticCasinos() {
    const games = await this.casinoService.getStaticCasino();
    return {
      success: true,
      message: 'Games fetched succssfully',
      games,
    };
  }
}
