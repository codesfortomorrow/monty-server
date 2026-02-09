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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BaseController,
  JwtAuthGuard,
  RolesGuard,
  UserType,
  Roles,
  AccessGuard,
  PaginationRequest,
  SentryExceptionFilter,
  AuthenticatedRequest,
  DateFilterRequest,
  DateFilterWithPaginationRequest,
} from '@Common';
import { TransactionsService } from '../transactions.service';
import {
  ExportUserTransactionDto,
  GetTransactionsRequestDto,
  UserGameTransactionRequest,
} from '../dto';
import { ExportFormat } from '@prisma/client';
import { ExportDepositWithdraw } from '../dto/deposit-withdraw.request';

@ApiTags('Transaction')
@ApiBearerAuth()
@UseFilters(SentryExceptionFilter)
@UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
@Controller('users/transactions')
export class TransactionsController extends BaseController {
  constructor(private readonly transactionsService: TransactionsService) {
    super();
  }

  @Get('all')
  @Roles(UserType.Admin, UserType.User)
  async getAll(@Query() query: GetTransactionsRequestDto) {
    return await this.transactionsService.getAll(UserType.Admin, {
      search: query.search,
      filters: {
        userId: query.userId ? BigInt(query.userId) : undefined,
        fromDate: query.fromDate,
        toDate: query.toDate,
        context: query.context,
        walletType: query.walletType,
        type: query.type,
        recordType: query.recordType,
      },
      // export: query.export,
      // exportFormat: query.exportFormat,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('/deposit-withdraw/:userId')
  @Roles(UserType.Admin, UserType.User)
  async getTransactionByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: DateFilterWithPaginationRequest,
  ) {
    const { transactions, pagination } =
      await this.transactionsService.getDepositWithdrawTransactionByUserId(
        userId,
        query,
      );

    return {
      success: true,
      message: 'Bet Transaction fetched successfully',
      transactions,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin, UserType.User)
  @Post('export-userTransaction')
  @UseGuards(JwtAuthGuard)
  async exportUserTransactionReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: ExportUserTransactionDto,
  ) {
    const ctx = this.getContext(req);
    return await this.transactionsService.exportUserTransactionReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @Get('game-transactions')
  @Roles(UserType.Admin, UserType.User)
  async getGameTransaction(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserGameTransactionRequest,
  ) {
    const ctx = this.getContext(req);
    const { transactions, pagination } =
      await this.transactionsService.getDownlineGameTransactions(
        ctx.user.id,
        ctx.user.type,
        query,
      );
    return {
      success: true,
      message: 'Game Transactions fetched successfully',
      transactions,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin, UserType.User)
  @Post('deposit-withdraw/export')
  @UseGuards(JwtAuthGuard)
  async depositWithdraw(
    @Req() req: AuthenticatedRequest,
    @Query() query: ExportDepositWithdraw,
  ) {
    const ctx = this.getContext(req);
    return await this.transactionsService.depositWithdraw(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin, UserType.User)
  @Post('export-game-transactions')
  @UseGuards(JwtAuthGuard)
  async gameTransactionReport(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserGameTransactionRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.transactionsService.gameTransactionReport(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }
}
