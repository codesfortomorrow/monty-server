import { Module } from '@nestjs/common';
import { SportsPermissionService } from './sports-permission.service';
import { SportsPermissionController } from './sports-permission.controller';
import { PrismaModule } from 'src/prisma';
import { UsersModule } from 'src/users';
import { AdminModule } from 'src/admin';

@Module({
  imports: [PrismaModule, UsersModule, AdminModule],
  controllers: [SportsPermissionController],
  providers: [SportsPermissionService],
  exports: [SportsPermissionService],
})
export class SportsPermissionModule {}
