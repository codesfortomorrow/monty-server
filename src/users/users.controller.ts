import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  // ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
// import { UserStatus } from '@prisma/client';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  RolesGuard,
  UserType,
  Roles,
  AccessGuard,
  SentryExceptionFilter,
} from '@Common';
import { UsersService } from './users.service';
import {
  ChangePasswordRequestDto,
  ChangeStatusRequest,
  ChangeUserPasswordRequest,
  CreateSubUserRequest,
  GetSubuserRequest,
  GetSummaryRequest,
  GetUsersRequestDto,
  UpdateProfileDetailsRequestDto,
  UpdateProfileImageRequestDto,
  UpdateUserProfileRequestDto,
} from './dto';

@ApiTags('User')
@ApiBearerAuth()
@UseFilters(SentryExceptionFilter)
@UseGuards(JwtAuthGuard, AccessGuard)
@Controller('users')
export class UsersController extends BaseController {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get()
  async getUsers(@Query() query: GetUsersRequestDto) {
    return await this.usersService.getAll(query);
  }

  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    console.log(ctx.user.type);
    return await this.usersService.getProfile(ctx.user.id, ctx.user.type);
  }

  @Patch('me')
  async updateProfileDetails(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateProfileDetailsRequestDto,
  ) {
    if (data.mobile && (!data.dialCode || !data.country)) {
      throw new BadRequestException();
    }
    const ctx = this.getContext(req);
    await this.usersService.updateProfileDetails(ctx.user.id, data);
    return { status: 'success' };
  }
  @Get('summary')
  async getSummary(
    @Query() query: GetSummaryRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    console.log('here');
    const ctx = this.getContext(req);

    const summary = await this.usersService.getSummary(
      Number(ctx.user.id),
      query.upline ?? String(ctx.user.path),
      query,
      ctx.user.type,
    );

    return {
      success: true,
      message: 'summary fetched successfully',
      summary,
    };
  }

  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Get(':userId')
  async getUserProfile(@Param('userId', ParseIntPipe) userId: bigint) {
    return await this.usersService.getProfile(userId, UserType.User);
  }

  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Patch(':userId')
  async updateUserProfileDetails(
    @Param('userId', ParseIntPipe) userId: bigint,
    @Body() data: UpdateUserProfileRequestDto,
  ) {
    return await this.usersService.updateProfileDetailsByAdministrator(
      userId,
      data,
    );
  }

  @Post('me/profile-image')
  updateProfileImage(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateProfileImageRequestDto,
  ) {
    const ctx = this.getContext(req);
    return this.usersService.updateProfileImage(ctx.user.id, data.profileImage);
  }

  @Post('me/change-password')
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() data: ChangePasswordRequestDto,
  ) {
    const ctx = this.getContext(req);
    const user = await this.usersService.changePassword(
      ctx.user.id,
      data.oldPassword,
      data.newPassword,
    );
    return {
      status: 'success',
      success: true,
      message: 'Password changed successfully',
      user,
    };
  }

  // @ApiParam({ name: 'status', enum: UserStatus })
  // @Roles(UserType.Admin)
  // @UseGuards(RolesGuard)
  // @Post(':userId/:status')
  // async setUserStatus(
  //   @Param('userId', ParseIntPipe) userId: bigint,
  //   @Param('status', new ParseEnumPipe(UserStatus)) status: UserStatus,
  // ) {
  //   await this.usersService.setStatus(userId, status);
  //   return { status: 'success' };
  // }

  @Post('sub-user')
  async createSubUser(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSubUserRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.usersService.createSubUser(
      ctx.user.id,
      dto,
      ctx.user.type,
    );
  }

  @Get('me/sub-users')
  async getSubUsers(
    @Query() query: GetSubuserRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    const { downlineUsers, pagination } = await this.usersService.getSubUsers(
      Number(ctx.user.id),
      query.upline || String(ctx.user.path),
      query,
      ctx.user.type,
      true,
    );

    return {
      success: true,
      message: 'Sub user fetched successfully',
      downlineUsers,
      pagination,
    };
  }

  @Get('sub-users/:userId')
  async getSubUsersByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: GetSubuserRequest,
  ) {
    const { downlineUsers, pagination } = await this.usersService.getSubUsers(
      userId,
      query.upline || '0',
      query,
      UserType.User,
      true,
    );

    return {
      success: true,
      message: 'Sub user fetched successfully',
      downlineUsers,
      pagination,
    };
  }

  @Patch('change-status/:userId')
  async changeStatusByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: ChangeStatusRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);

    await this.usersService.changeStatusForUserAndDownline(
      BigInt(ctx.user.id),
      BigInt(userId),
      body.status,
      ctx.user.type,
    );

    return {
      success: true,
      message: 'Status updated successfully',
    };
  }

  @Get('/account/summary/:userId')
  async getAccountSummary(@Param('userId', ParseIntPipe) userId: number) {
    const accountSummary = await this.usersService.getAccountSummary(
      BigInt(userId),
    );
    return {
      success: true,
      message: 'Account summary fetched successfully',
      accountSummary,
    };
  }

  @Patch('change/password/:id')
  async changeUserPassword(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeUserPasswordRequest,
  ) {
    const ctx = this.getContext(req);
    const user = await this.usersService.updatePasswordByUserId(
      ctx.user.id,
      id,
      dto,
      ctx.user.type,
    );
    return {
      success: true,
      message: 'Password changed successfully',
      user,
    };
  }

  @ApiBearerAuth()
  @Post('/transaction-code/viewed')
  @UseGuards(JwtAuthGuard)
  async markTransactionCodeViewed(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    await this.usersService.markTransactionCodeViewed(ctx.user.id);
    return {
      success: true,
      message: 'Transaction code viewed successfully',
    };
  }

  @ApiBearerAuth()
  @Post('/export-subuser')
  @UseGuards(JwtAuthGuard)
  async exportSubUserReport(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetSubuserRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.usersService.exportSubUserReport(
      ctx.user.id,
      query.upline || String(ctx.user.path),
      ctx.user.type,
      query,
    );
  }
}
