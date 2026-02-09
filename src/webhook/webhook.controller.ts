import { Body, Controller, Post, UseFilters } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { ApiTags } from '@nestjs/swagger';
import { SentryExceptionFilter } from '@Common';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @UseFilters(SentryExceptionFilter)
  @Post('/sports/result')
  async betResult(@Body() body: any) {
    // console.log('Body', body);
    await this.webhookService.processWebhookResults(body);
    return {
      success: true,
      message: 'Bet result recevied successfully',
    };
  }

  @UseFilters(SentryExceptionFilter)
  @Post('/sports/market/status')
  async changeMarketStatus(@Body() body: any) {
    console.log('Market status change webhook hit', body);
    return {
      success: true,
      message: 'Market status changed successfully',
    };
  }
}
