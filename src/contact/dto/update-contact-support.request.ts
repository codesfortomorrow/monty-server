import { PartialType } from '@nestjs/swagger';
import { CreateContactSupportDto } from './create-contact-support.request';

export class UpdateContactSupportDto extends PartialType(
  CreateContactSupportDto,
) {}
