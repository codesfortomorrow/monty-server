import { Controller, Post, UseFilters } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { ApiTags } from '@nestjs/swagger';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Captcha')
@UseFilters(SentryExceptionFilter)
@Controller('captcha')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Post()
  async generate() {
    return this.captchaService.generateCaptcha();
  }

  //   @Post('verify')
  //   async verify(
  //     @Body('captchaId') captchaId: string,
  //     @Body('input') input: string,
  //   ) {
  //     const valid = await this.captchaService.verifyCaptcha(captchaId, input);
  //     return valid
  //       ? { success: true, message: 'Captcha verified' }
  //       : { success: false, message: 'Invalid captcha' };
  //   }
}
