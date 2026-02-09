import { Module } from '@nestjs/common';
import { BussinessReportService } from './bussiness-report.service';
import { BussinessReportController } from './bussiness-report.controller';
import { PrismaModule } from 'src/prisma';
import { UsersModule } from 'src/users';
import { RedisModule } from 'src/redis';

@Module({
  imports: [PrismaModule, UsersModule, RedisModule],
  controllers: [BussinessReportController],
  providers: [BussinessReportService],
  exports: [BussinessReportService],
})
export class BussinessReportModule {}
