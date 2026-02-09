import { BaseService } from '@Common';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { UpdateStakeSetRequest } from './dto';
import { ConfigType } from '@nestjs/config';
import { stakeSetConfigFactory } from '@Config';
import { UsersService } from 'src/users';

@Injectable()
export class StakesetService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UsersService,
    @Inject(stakeSetConfigFactory.KEY)
    private readonly config: ConfigType<typeof stakeSetConfigFactory>,
  ) {
    super({ loggerDefaultMeta: { service: StakesetService.name } });
  }

  async updateStakeSet(userId: bigint, body: UpdateStakeSetRequest) {
    const user = await this.userService.getById(userId);
    if (!user) throw new Error('User not found');
    const stakeSet = await this.prisma.stakeSet.upsert({
      where: { userId: user.id },
      update: {
        data: JSON.parse(JSON.stringify(body.data)),
      },
      create: {
        userId,
        data: JSON.parse(JSON.stringify(body.data)),
      },
    });
    return stakeSet;
  }
  async getStakeSet(userId: bigint) {
    const stakeSet = await this.prisma.stakeSet.findUnique({
      where: { userId },
    });
    if (!stakeSet) {
      return this.config.stakeSet;
    }
    return stakeSet.data;
  }
}
