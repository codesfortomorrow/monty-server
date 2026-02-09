import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';
import { RoleService } from './role.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  SentryExceptionFilter,
} from '@Common';

@ApiTags('Role')
@UseFilters(SentryExceptionFilter)
@Controller('role')
export class RoleController extends BaseController {
  constructor(private readonly roleService: RoleService) {
    super();
  }

  @Get()
  async getAllRole() {
    return await this.roleService.getAllRoles();
  }

  @ApiBearerAuth()
  @Get('/available')
  @UseGuards(JwtAuthGuard)
  async getAvailableSubUserRole(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req);
    return await this.roleService.getAvailableSubUserRole(
      ctx.user.id,
      ctx.user.type,
    );
  }
}
