import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma';
import { ContactSupportController } from './contact-support.controller';
import { ContactSupportService } from './contact-support.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContactSupportController],
  providers: [ContactSupportService],
})
export class ContactSupportModule {}
