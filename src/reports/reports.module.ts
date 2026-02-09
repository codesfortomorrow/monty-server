import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from 'src/prisma';
import { RedisModule } from 'src/redis';
import { UsersModule } from 'src/users';

@Module({
  imports: [PrismaModule, RedisModule, UsersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
