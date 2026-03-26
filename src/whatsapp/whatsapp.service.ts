import { whatsappConfigFactory } from '@Config';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly httpService: HttpService,
    @Inject(whatsappConfigFactory.KEY)
    private readonly config: ConfigType<typeof whatsappConfigFactory>,
  ) {}

  async send(mobile: string, text: string): Promise<void> {
    const baseurl = this.config.url;
    const secret = this.config.secret;
    const phpsessid = this.config.phpsessid;

    if (!baseurl || !secret || !phpsessid)
      throw new Error('Whatsapp Base url or secret are not configured');

    const url = `${baseurl}/api/send/sms`;

    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('mode', 'credits');
    formData.append('phone', mobile);
    formData.append('message', `otp1::en::AUTHENTICATION::${text}`);
    formData.append('gateway', '1');

    try {
      await firstValueFrom(
        this.httpService
          .post(url, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              Cookie: `PHPSESSID=${phpsessid}`,
            },
          })
          .pipe(timeout(15000)),
      );
    } catch (error: any) {
      console.error(
        'Whatsapp SMS API Error:',
        error?.response?.data || error.message,
      );
      throw error;
    }
  }
}
