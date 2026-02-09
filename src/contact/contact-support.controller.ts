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
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  AccessGuard,
  RolesGuard,
  Roles,
  UserType,
  SentryExceptionFilter,
} from '@Common';

import { ContactSupportService } from './contact-support.service';
import {
  CreateContactSupportDto,
  FindAllContactSupportDto,
  mapContactSupportDto,
  SetActiveStatusDto,
  UpdateContactSupportDto,
} from './dto';
import { query } from 'winston';

ApiTags('Contact Support');
@UseFilters(SentryExceptionFilter)
@Controller('contact-support')
export class ContactSupportController {
  constructor(private readonly contactSupportService: ContactSupportService) {}

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Post()
  async create(@Body() data: CreateContactSupportDto) {
    const payload = mapContactSupportDto(data, true);
    return this.contactSupportService.create(payload);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Get('admin')
  async getAll(@Query() query: FindAllContactSupportDto) {
    return await this.contactSupportService.findAll(query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async findOneActive() {
    return await this.contactSupportService.findActive();
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Patch(':id')
  async updateContact(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactSupportDto,
  ) {
    const payload = mapContactSupportDto(dto, false);

    return this.contactSupportService.update(id, payload);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Patch('active/:id')
  async setActiveStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetActiveStatusDto,
  ) {
    return this.contactSupportService.setActiveStatus(id, dto.isActive);
  }

  @ApiBearerAuth()
  @Roles(UserType.Admin)
  @UseGuards(JwtAuthGuard, AccessGuard, RolesGuard)
  @Delete(':id')
  async deleteContact(@Param('id', ParseIntPipe) id: number) {
    return await this.contactSupportService.remove(id);
  }
}
