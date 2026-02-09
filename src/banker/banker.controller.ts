import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { BankerService } from './banker.service';
import {
  CreatepaymentConfigDto,
  GetBankersDto,
  GetDepositWithdrawQueryDto,
  UpdateDepositWithdrawStatusDto,
  GetMyDepositWithdrawQueryDto,
  GetDeshbordDto,
  CreateConversionRateDto,
  ExportDepositWithdrawQueryDto,
} from './dto';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Banker')
@UseFilters(SentryExceptionFilter)
@Controller('banker')
export class BankerController extends BaseController {
  constructor(private readonly bankerService: BankerService) {
    super();
  }

  // @ApiBearerAuth()
  // @Roles(UserType.Admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Get('admin')
  // async getAll(@Query() query: GetBankersDto) {
  //   return await this.bankerService.getAllBankers(query);
  // }

  // @ApiBearerAuth()
  // @Roles(UserType.Admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Delete('bankers/:id')
  // async deleteBanker(@Param('id', ParseIntPipe) id: number) {
  //   const bankerId = BigInt(id);
  //   return this.bankerService.deleteBanker(bankerId);
  // }
  // @ApiBearerAuth()
  // @Roles(UserType.Admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Delete('bankers/:id')
  // async deleteBanker(@Param('id', ParseIntPipe) id: number) {
  //   const bankerId = BigInt(id);
  //   return await this.bankerService.deleteBanker(bankerId);
  // }

  // @ApiBearerAuth()
  // @Roles(UserType.Admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Patch('active-banker/:bankerId')
  // async setActiveBanker(@Param('bankerId', ParseIntPipe) bankerId: number) {
  //   return await this.bankerService.setActiveBanker(BigInt(bankerId));
  // }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseFilters(SentryExceptionFilter)
  @Get('my-deposit-withdraw')
  async getMyDepositWithdrawRequests(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetMyDepositWithdrawQueryDto,
  ) {
    const ctx = this.getContext(req);
    return await this.bankerService.getDepositWithdrawRequests(
      ctx.user.id,
      query,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseFilters(SentryExceptionFilter)
  @Get('all-deposit-withdraw')
  async getAllDepositWithdrawRequests(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetDepositWithdrawQueryDto,
  ) {
    const ctx = this.getContext(req);
    return this.bankerService.getAllDepositWithdrawRequests(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }

  @ApiBearerAuth()
  @UseFilters(SentryExceptionFilter)
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDepositWithdrawStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.bankerService.updateDepositWithdrawStatus(
      BigInt(id),
      body.status,
      ctx.user.id,
      ctx.user.type,
      body.transactionCode,
      body.remark,
    );
  }

  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard)
  // @Get('active-banker')
  // async showActiveBanker() {
  //   return await this.bankerService.showActiveBanker();
  // }

  // @ApiBearerAuth()
  // @Roles(UserType.Admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Get('dashboard/:id')
  // async DedashboardId(
  //   @Query() query: GetDeshbordDto,
  //   @Param('id', ParseIntPipe) id: number,
  // ) {
  //   return this.bankerService.getDepositWithdrawSummary({
  //     fromDate: query.fromDate,
  //     toDate: query.toDate,
  //     bankerId: BigInt(id),
  //   });
  // }

  // @ApiBearerAuth()
  // @Roles(UserType.Admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Get('dashboard-admin')
  // async dashboardWithoutId(@Query() query: GetDeshbordDto) {
  //   return await this.bankerService.getDepositWithdrawSummary(query);
  // }

  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard)
  // @Get('dashboard')
  // async Dedashboard(
  //   @Query() query: GetDeshbordDto,
  //   @Req() req: AuthenticatedRequest,
  // ) {
  //   const ctx = this.getContext(req);
  //   return await this.bankerService.getDepositWithdrawSummary({
  //     fromDate: query.fromDate,
  //     toDate: query.toDate,
  //     bankerId: ctx.user.id,
  //   });
  // }

  // @ApiBearerAuth()
  // @Roles(UserType.Admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Post(':bankerId/payment-config')
  // createOrUpdatePaymentConfig(
  //   @Param('bankerId', ParseIntPipe) bankerId: number,
  //   @Body() data: CreatepaymentConfigDto,
  // ) {
  //   return this.bankerService.createOrUpdatePaymentConfig(
  //     BigInt(bankerId),
  //     data,
  //   );
  // }

  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard)
  // @Get('paymentConfig')
  // get(@Req() req: AuthenticatedRequest) {
  //   const ctx = this.getContext(req);
  //   return this.bankerService.getpaymentConfig(ctx.user.id);
  // }

  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard)
  // @Get('find-banker-config')
  // async findBankerConfig(@Req() req: AuthenticatedRequest) {
  //   const ctx = this.getContext(req);
  //   return await this.bankerService.findBankerConfigs(BigInt(ctx.user.id));
  // }

  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard)
  // @Delete('payment-config')
  // delete(@Req() req: AuthenticatedRequest) {
  //   const ctx = this.getContext(req);
  //   const bankerId = ctx.user.id;
  //   return this.bankerService.deletepaymentConfig(bankerId);
  // }

  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard)
  // @Post('export-deposit-withdraw')
  // async exportAllDepositWithdrawRequests(
  //   @Req() req: AuthenticatedRequest,
  //   @Query() query: ExportDepositWithdrawQueryDto,
  // ) {
  //   const ctx = this.getContext(req);
  //   return await this.bankerService.exportDepositWithdraw(ctx.user.id, query);
  // }

  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard)
  // @Get('show-account')
  // async showAccount(@Req() req: AuthenticatedRequest) {
  //   const ctx = this.getContext(req);
  //   return this.bankerService.showAccount(ctx.user.id);
  // }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @CacheTTL(1)
  @Get('show-account')
  async showAccount(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    return this.bankerService.showAccount(ctx.user.id);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('conversion-rate/:id')
  updateAllCryptoConversionRate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateConversionRateDto,
  ) {
    return this.bankerService.updateAllCryptoConversionRate(
      id,
      dto.conversionRate,
    );
  }
}
