import { PartialType } from '@nestjs/swagger';
import { CreateExposureDto } from './create-exposure.request';

export class UpdateExposureDto extends PartialType(CreateExposureDto) {}
