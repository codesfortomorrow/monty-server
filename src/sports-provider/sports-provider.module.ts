import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SportsProviderService } from './sports-provider.service';
import { SportsProviderController } from './sports-provider.controller';
import { PrismaModule } from 'src/prisma';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [SportsProviderController],
  providers: [SportsProviderService],
})
export class SportsProviderModule {}
