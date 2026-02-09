import { Module } from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsProcessor } from './competitions.processor';
import { PrismaModule } from 'src/prisma';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/redis';
import { AlertModule } from 'src/alert/alert.module';

@Module({
  imports: [PrismaModule, HttpModule, RedisModule, AlertModule],
  controllers: [CompetitionsController],
  providers: [CompetitionsService, CompetitionsProcessor],
  exports: [CompetitionsProcessor],
})
export class CompetitionsModule {}
