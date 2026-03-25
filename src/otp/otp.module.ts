import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { PrismaModule } from '../prisma';
import { MailModule } from '../mail';
import { SmsModule } from '../sms';
import { WhatsappModule } from 'src/whatsapp';

@Module({
  imports: [PrismaModule, SmsModule, MailModule, WhatsappModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
