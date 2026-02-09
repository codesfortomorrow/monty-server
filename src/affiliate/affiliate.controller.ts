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
import { AffiliateService } from './affiliate.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  PaginationRequest,
  Roles,
  RolesGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ActiveUserDto,
  CreateAffiliateDto,
  CreateCommissionRangeDto,
  GetAffiliateListDto,
  GetReferralUsersDto,
  GetWeeklyCommissionHistoryDto,
  UpdateAffiliateStatusDto,
  UpdateCommissionRangeDto,
} from './dto';

@ApiTags('Affiliate')
@ApiBearerAuth()
@UseFilters(SentryExceptionFilter)
@UseGuards(JwtAuthGuard)
@Controller('affiliate')
export class AffiliateController extends BaseController {
  constructor(private readonly affiliateService: AffiliateService) {
    super();
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get()
  async getDashboardData() {
    return await this.affiliateService.getDashboardData();
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get('affiliates')
  async getAllAffiliates(@Query() query: GetAffiliateListDto) {
    return await this.affiliateService.getAllAffiliates(query);
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get('affiliates-list')
  async getAffiliateList(@Query() query: GetReferralUsersDto) {
    return await this.affiliateService.getAffiliateList(query);
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Patch('status/:id')
  async updateAffiliateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAffiliateStatusDto,
  ) {
    return await this.affiliateService.updateAffiliate(BigInt(id), {
      requestStatus: dto.requestStatus,
      reasonTo: dto.reasonTo,
    });
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return await this.affiliateService.deleteAffiliate(BigInt(id));
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Get('affiliates-list/:id')
  async AffiliateReferralUsersListing(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: GetReferralUsersDto,
  ) {
    return await this.affiliateService.getReferralUsersListing(
      BigInt(id),
      query,
    );
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get('weekly-commission/all')
  async getAllWeeklyCommissionHistory(
    @Query() query: GetWeeklyCommissionHistoryDto,
  ) {
    const result =
      await this.affiliateService.getWeeklyCommissionReportForAdmin(query);
    return result;
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Post('create-range')
  create(@Body() data: CreateCommissionRangeDto) {
    return this.affiliateService.createCommissionRange(data);
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get('all-range')
  getAllRanges() {
    return this.affiliateService.getAllCommissionRanges();
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get('range-history')
  async getHistory(@Query() query: PaginationRequest) {
    return await this.affiliateService.getCommissionRangeHistory(query);
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Patch('update-range/:id')
  updateRange(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateCommissionRangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return this.affiliateService.updateCommissionRange(
      BigInt(id),
      userId,
      ctx.user.type,
      data,
    );
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Delete('delete-range/:id')
  deleteRange(@Param('id', ParseIntPipe) id: number) {
    return this.affiliateService.deleteCommissionRange(BigInt(id));
  }

  @Post('create')
  async createAffiliate(
    @Body() data: CreateAffiliateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.affiliateService.createAffiliateRequest(userId, data);
  }

  @Get('affiliate-dashboard')
  async getAffiliateByuserid(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.affiliateService.getAffiliateByUserId(userId);
  }

  @Get('weekly-commission')
  async getWeeklyCommissionHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetWeeklyCommissionHistoryDto,
  ) {
    const ctx = this.getContext(req);
    const result = await this.affiliateService.getWeeklyCommissionHistory(
      ctx.user.id,
      query,
    );
    return result;
  }

  @Get('referred-users')
  async getReferredUsersReport(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetReferralUsersDto,
  ) {
    const ctx = this.getContext(req);
    const userId = ctx.user.id;
    return await this.affiliateService.getReferralUsers(userId, query);
  }

  @ApiOperation({
    summary: 'Admin',
  })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get('active-user/:id')
  getActiveUser(
    @Param('id', ParseIntPipe) id: number,
    @Query() data: ActiveUserDto,
  ) {
    return this.affiliateService.getActiveUser(BigInt(id), data);
  }

  @ApiBearerAuth()
  @Post('/export-list')
  @UseGuards(JwtAuthGuard)
  async exportAffiliateList(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetReferralUsersDto,
  ) {
    const ctx = this.getContext(req);

    return await this.affiliateService.exportAffiliateList(ctx.user.id, query);
  }

  @ApiBearerAuth()
  @Post('/export-commission')
  @UseGuards(JwtAuthGuard)
  async exportAffiliateCommistion(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetWeeklyCommissionHistoryDto,
  ) {
    const ctx = this.getContext(req);

    return await this.affiliateService.exportAffiliateCommistion(
      ctx.user.id,
      query,
    );
  }
}
