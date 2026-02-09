import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { UsersModule } from 'src/users';
import { PrismaModule } from 'src/prisma';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/redis';
import { AlertModule } from 'src/alert/alert.module';

@Module({
  imports: [UsersModule, PrismaModule, HttpModule, RedisModule, AlertModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
