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
import { BonusService } from './bonus.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { GetBonusQueryDto } from './dto/get-bonus-dto';
import { UpsertBonusDto } from './dto/upsert-bonus-by-category.dto';
import { UpdateBonusStatusDto } from './dto/update-bonus-status.dto';
import { GetBonusApplicantsQueryDto } from './dto/get-bonus-applicant.dto';
import { ApproveBonusApplicantDto } from './dto/approve-bonus-applicant.dto';

@ApiTags('Bonus')
// @ApiBearerAuth()
@UseFilters(SentryExceptionFilter)
@Controller('bonuses')
export class BonusController extends BaseController {
  constructor(private readonly service: BonusService) {
    super();
  }

  @Get('game-categories')
  getGameCategories() {
    return this.service.getGameCategories();
  }

  @Post('upsert')
  upsert(@Body() dto: UpsertBonusDto) {
    return this.service.upsertByCategory(dto);
  }

  @Get()
  getAllBonuses(@Query() query: GetBonusQueryDto) {
    return this.service.getAllBonus(
      query.status,
      query.search,
      query.category,
      query.fromDate,
      query.toDate,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: Number })
  getBonusById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getBonusById(id);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', type: Number })
  deleteBonusById(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteBonus(id);
  }

  @Patch(':id/status')
  @ApiParam({ name: 'id', type: Number })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBonusStatusDto,
  ) {
    return this.service.changeStatus(id, body.status);
  }

  @Get('applicants/list')
  getAllBonusApplicants(@Query() query: GetBonusApplicantsQueryDto) {
    return this.service.getAllBonusApplicants(query);
  }

  @Patch('applicants/:id/approve')
  @ApiParam({ name: 'id', type: Number })
  approveBonusApplicant(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveBonusApplicantDto,
  ) {
    return this.service.approveBonusApplicant(
      id,
      body.status,
      body.reason,
      body.installmentId,
    );
  }

  @ApiBearerAuth()
  @Post('/export-statement')
  @UseGuards(JwtAuthGuard)
  async exportCasinoDownlineProfitLossReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetBonusApplicantsQueryDto,
  ) {
    const ctx = this.getContext(req);
    return await this.service.exportBonusStatementReport(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }
}
