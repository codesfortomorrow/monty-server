// import {
//   Controller,
//   Get,
//   Query,
//   Req,
//   UseFilters,
//   UseGuards,
// } from '@nestjs/common';
// import { UserBonusService } from './user-bonus.service';
// import {
//   BonusTurnoverQueryDto,
//   CreateUserBonusDto,
// } from './dto/bonus-turnover-query.dto';
// import {
//   AccessGuard,
//   AuthenticatedRequest,
//   BaseController,
//   DateFilterRequest,
//   DateFilterWithPaginationRequest,
//   JwtAuthGuard,
// } from '@Common';
// import { ReferredUsersQueryDto } from './dto/referred-users-query.dto';
// import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
// import { BonusStatementDTO } from './dto/bonus-statement-query.dto';

// @ApiTags('User Bonus')
// @ApiBearerAuth()
// // @UseFilters(SentryExceptionFilter)
// @UseGuards(JwtAuthGuard, AccessGuard)
// @Controller('user-bonus')
// export class UserBonusController extends BaseController {
//   constructor(private readonly userBonusService: UserBonusService) {
//     super();
//   }

//   @Get('total-summary')
//   async getBonusSummary(
//     @Query() query: DateFilterRequest,
//     @Req() req: AuthenticatedRequest,
//   ) {
//     const ctx = this.getContext(req);
//     const userId = ctx.user.id;
//     console.log('userID : ', userId);
//     return this.userBonusService.getUserBonusSummary(BigInt(userId), query);
//   }

//   @Get('turnover')
//   getBonusTurnover(
//     @Req() req: AuthenticatedRequest,
//     @Query() query: BonusTurnoverQueryDto,
//   ) {
//     const ctx = this.getContext(req);
//     const userId = ctx.user.id;
//     return this.userBonusService.getUserBonusTurnover(
//       BigInt(userId),
//       query.status,
//       query.page,
//       query.limit,
//     );
//   }

//   @Get('statement')
//   getBonusStatement(
//     @Req() req: AuthenticatedRequest,
//     @Query() query: BonusStatementDTO,
//   ) {
//     const ctx = this.getContext(req);
//     const userId = ctx.user.id;
//     return this.userBonusService.getBonusStatement(BigInt(userId), query);
//   }

//   @Get('earnings')
//   getBonusEarnings(@Req() req: AuthenticatedRequest) {
//     const ctx = this.getContext(req);
//     const userId = ctx.user.id;
//     return this.userBonusService.getUserBonusEarnings(BigInt(userId));
//   }

//   // Referrals
//   @Get('referral/earnings')
//   async getReferralEarnings(@Req() req: AuthenticatedRequest) {
//     const userId = BigInt(req.user.id);
//     return this.userBonusService.getReferralEarnings(userId);
//   }

//   @Get('referral/referees')
//   async getReferredUsers(
//     @Req() req: AuthenticatedRequest,
//     @Query() query: ReferredUsersQueryDto,
//   ) {
//     const userId = BigInt(req.user.id);
//     console.log('userId : ', userId);
//     return this.userBonusService.getReferredUsers(userId, query);
//   }

//   @Get('referral/totals')
//   async getReferralTotals(@Req() req: AuthenticatedRequest) {
//     const userId = BigInt(req.user.id);
//     return this.userBonusService.getReferralTotals(userId);
//   }
// }
