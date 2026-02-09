import {
  Controller,
  Get,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BaseController,
  JwtAuthGuard,
  UserType,
  AuthenticatedRequest,
  AccessGuard,
  SentryExceptionFilter,
} from '@Common';
import { TransactionsService } from '../transactions.service';
import { GetUserTransactionsRequestDto } from '../dto';

@ApiTags('Transaction')
@ApiBearerAuth()
@UseFilters(SentryExceptionFilter)
@UseGuards(JwtAuthGuard, AccessGuard)
@Controller('users/me/transactions')
export class MeTransactionsController extends BaseController {
  constructor(private readonly transactionsService: TransactionsService) {
    super();
  }

  @Get()
  async getAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetUserTransactionsRequestDto,
  ) {
    const ctx = this.getContext(req);
    if (ctx.user.type === UserType.User) {
      return await this.transactionsService.getAll(UserType.User, {
        search: query.search,
        filters: {
          userId: BigInt(ctx.user.id),
          fromDate: query.fromDate,
          toDate: query.toDate,
          context: query.context,
          walletType: query.walletType,
          type: query.type,
          recordType: query.recordType,
        },
        page: query.page,
        limit: query.limit,
      });
    } else {
      return await this.transactionsService.getAll(UserType.Admin, {
        search: query.search,
        filters: {
          adminId: BigInt(ctx.user.id),
          fromDate: query.fromDate,
          toDate: query.toDate,
          context: query.context,
          walletType: query.walletType,
          type: query.type,
          recordType: query.recordType,
        },
        page: query.page,
        limit: query.limit,
      });
    }
  }
}
