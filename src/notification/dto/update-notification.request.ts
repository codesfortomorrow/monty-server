import { PartialType } from '@nestjs/swagger';
import { CreateNotificationDto } from './create-notification.request';

export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {}
