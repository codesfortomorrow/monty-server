import { Body, Controller, Post, UseFilters } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { MFARequestDto } from './dto/mfa.request';
import { ApiTags } from '@nestjs/swagger';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Multi Factor Authentication')
@Controller('mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @UseFilters(SentryExceptionFilter)
  @Post('/setup')
  async setupMfa(@Body() data: MFARequestDto) {
    return this.mfaService.setupMFA(data);
  }
}
