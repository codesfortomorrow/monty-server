import { Injectable } from '@nestjs/common';
import * as svgCaptcha from 'svg-captcha';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from 'src/redis';

@Injectable()
export class CaptchaService {
  constructor(private readonly redisService: RedisService) {}

  async generateCaptcha() {
    const captcha = svgCaptcha.create({
      size: 5,
      noise: 2,
      color: true,
      background: '#494949a2',
      charPreset: '0123456789',
    });

    const captchaId = uuidv4();

    // store in Redis for 2 minutes
    await this.redisService.client.setex(
      `captcha:${captchaId}`,
      120,
      captcha.text,
    );

    console.log('captcha', captcha.text);
    return {
      captchaId,
      svg: captcha.data,
    };
  }

  async verifyCaptcha(captchaId: string, input: string): Promise<boolean> {
    const key = `captcha:${captchaId}`;
    const stored = await this.redisService.client.get(key);
    if (!stored) return false;

    const isValid = input.trim().toLowerCase() === stored.trim().toLowerCase();

    if (isValid) {
      await this.redisService.client.del(key); // remove after success
    }

    return isValid;
  }
}
