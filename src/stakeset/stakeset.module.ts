import { Module } from '@nestjs/common';
import { StakesetService } from './stakeset.service';
import { StakesetController } from './stakeset.controller';
import { PrismaModule } from 'src/prisma';
import { UsersModule } from 'src/users';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [StakesetController],
  providers: [StakesetService],
})
export class StakesetModule {}
