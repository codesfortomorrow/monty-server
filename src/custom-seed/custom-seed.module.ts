import { Module } from '@nestjs/common';
import { CustomSeedService } from './custom-seed.service';
import { CustomSeedController } from './custom-seed.controller';
import { PrismaModule } from 'src/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [CustomSeedController],
  providers: [CustomSeedService],
})
export class CustomSeedModule {}
