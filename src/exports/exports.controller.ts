import {
  Controller,
  Get,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { getExportReportDto } from './dto';
import { ExportsService } from './exports.service';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  SentryExceptionFilter,
  UserType,
} from '@Common';

@ApiTags('Exports')
@ApiBearerAuth()
@UseFilters(SentryExceptionFilter)
@Controller('exports')
export class ExportsController extends BaseController {
  constructor(private readonly exportsService: ExportsService) {
    super();
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('/report')
  async getExportFile(
    @Query() query: getExportReportDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const ctx = this.getContext(req);
    return await this.exportsService.getExportReport(ctx.user.id, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('/report/me')
  async exportAllDepositWithdrawRequests(
    @Req() req: AuthenticatedRequest,
    @Query() query: getExportReportDto,
  ) {
    const ctx = this.getContext(req);
    return await this.exportsService.getUserExportAttachments(
      ctx.user.id,
      ctx.user.type,
      query,
    );
  }
}
