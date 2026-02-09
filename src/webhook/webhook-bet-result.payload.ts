import { ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { WebhookMarketResultDto } from './webhook-bet-result.request';

export class WebhookPayloadDto {
  @ValidateNested({ each: true })
  @Type(() => WebhookMarketResultDto)
  @ArrayMinSize(1)
  data: WebhookMarketResultDto[];
}
