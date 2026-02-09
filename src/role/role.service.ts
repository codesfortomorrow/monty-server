import { UserType } from '@Common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllRoles() {
    return await this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
  }

  async getAvailableSubUserRole(userId: bigint, userType: UserType) {
    let user;
    if (userType === UserType.Admin) {
      user = await this.prisma.admin.findUnique({
        where: { id: userId },
        include: { role: true },
      });
    } else
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

    if (!user || !user.role) throw new Error('User not found');

    return await this.prisma.role.findMany({
      where: { level: { gt: user.role.level } },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
  }
}
