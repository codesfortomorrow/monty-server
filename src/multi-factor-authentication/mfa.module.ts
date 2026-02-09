import { Module } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { PrismaModule } from 'src/prisma';
import { UsersModule } from 'src/users';
import { AdminModule } from 'src/admin';

@Module({
  imports: [PrismaModule, UsersModule, AdminModule],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
