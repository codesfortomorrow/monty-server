import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { BussinessReportService } from './bussiness-report.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import {
  ActiveUserReportRequest,
  DepositeReportRequest,
  IdleUserReportRequest,
  LoginReportRequest,
  SignupReportRequest,
  ExportReport,
  WithdrawReportRequest,
} from './dto';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@Controller('bussiness-report')
export class BussinessReportController extends BaseController {
  constructor(private readonly bussinessReportService: BussinessReportService) {
    super({ loggerDefaultMeta: { controller: BaseController.name } });
  }

  @Get('/deposits')
  @UseFilters(SentryExceptionFilter)
  @UseGuards(JwtAuthGuard)
  async getDepositsReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: DepositeReportRequest,
  ) {
    const ctx = this.getContext(req);
    const { deposits, pagination } =
      await this.bussinessReportService.getDepositeReports(
        ctx.user.id,
        ctx.user.type,
        query,
      );

    return {
      success: true,
      message: 'Deposits reports fetched successfully',
      deposits,
      pagination,
    };
  }

  @Get('/withdraws')
  @UseGuards(JwtAuthGuard)
  async getWithdrawsReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: WithdrawReportRequest,
  ) {
    const ctx = this.getContext(req);
    const { withdraws, pagination } =
      await this.bussinessReportService.getWithdrawReports(
        ctx.user.id,
        ctx.user.type,
        query,
      );

    return {
      success: true,
      message: 'Withdraws reports fetched successfully',
      withdraws,
      pagination,
    };
  }
  @Get('/logins')
  @UseGuards(JwtAuthGuard)
  async getLoginsReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: LoginReportRequest,
  ) {
    const ctx = this.getContext(req);
    const { logins, pagination } =
      await this.bussinessReportService.getLoginReports(
        ctx.user.id,
        ctx.user.type,
        query,
      );

    return {
      success: true,
      message: 'Logins reports fetched successfully',
      logins,
      pagination,
    };
  }
  @Get('/signups')
  @UseGuards(JwtAuthGuard)
  async getSignupsReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: SignupReportRequest,
  ) {
    const ctx = this.getContext(req);
    const { signups, pagination } =
      await this.bussinessReportService.getSignupReports(
        ctx.user.id,
        ctx.user.type,
        query,
      );

    return {
      success: true,
      message: 'Signups reports fetched successfully',
      signups,
      pagination,
    };
  }
  @Get('/active-users')
  @UseGuards(JwtAuthGuard)
  async getActiveUsersReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: ActiveUserReportRequest,
  ) {
    const ctx = this.getContext(req);
    const { activeUsers, pagination } =
      await this.bussinessReportService.getActiveUserReports(
        ctx.user.id,
        ctx.user.type,
        query,
      );

    return {
      success: true,
      message: 'Active users reports fetched successfully',
      activeUsers,
      pagination,
    };
  }
  @Get('/idle-users')
  @UseGuards(JwtAuthGuard)
  async getIdlesReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: IdleUserReportRequest,
  ) {
    const ctx = this.getContext(req);
    const { idleUsers, pagination } =
      await this.bussinessReportService.getIdleUsersReports(
        ctx.user.id,
        ctx.user.type,
        query,
      );

    return {
      success: true,
      message: 'Idle users reports fetched successfully',
      idleUsers,
      pagination,
    };
  }

  @ApiBearerAuth()
  @Post('/export-deposit')
  @UseGuards(JwtAuthGuard)
  async exportDepositReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: DepositeReportRequest,
  ) {
    const ctx = this.getContext(req);

    return await this.bussinessReportService.exportDepositReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-withdrawal')
  @UseGuards(JwtAuthGuard)
  async exportWithdrawalReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: WithdrawReportRequest,
  ) {
    const ctx = this.getContext(req);

    return await this.bussinessReportService.exportWithdrawalReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-logins')
  @UseGuards(JwtAuthGuard)
  async exportLoginReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: LoginReportRequest,
  ) {
    const ctx = this.getContext(req);

    return await this.bussinessReportService.exportLoginReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-signups')
  @UseGuards(JwtAuthGuard)
  async exportSignupReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: SignupReportRequest,
  ) {
    const ctx = this.getContext(req);

    return await this.bussinessReportService.exportSignupReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-active-users')
  @UseGuards(JwtAuthGuard)
  async exportActiveUsersReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: ActiveUserReportRequest,
  ) {
    const ctx = this.getContext(req);

    return await this.bussinessReportService.exportActiveUsersReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @Post('/export-idle-users')
  @UseGuards(JwtAuthGuard)
  async exportIdleUsersReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: IdleUserReportRequest,
  ) {
    const ctx = this.getContext(req);

    return await this.bussinessReportService.exportIdleUsersReports(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }
}
