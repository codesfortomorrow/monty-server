import { BaseService, UserType } from '@Common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma';
import { UsersService } from 'src/users';
import { PermissionDto, UpdateSportsPermissionRequest } from './dto';
import { AdminService } from 'src/admin';

@Injectable()
export class SportsPermissionService extends BaseService {
  constructor(
    private readonly userService: UsersService,
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {
    super({ loggerDefaultMeta: { service: SportsPermissionService.name } });
  }

  async updateSportsPermission(
    userId: bigint | number,
    permission: UpdateSportsPermissionRequest,
    updatedBy: bigint,
    userType: UserType,
  ) {
    const user = await this.userService.getById(userId);
    const isValid = await this.validate(
      updatedBy,
      userType,
      permission.data,
      // permission.transactionCode,
    );
    if (!isValid.success) throw new Error(isValid.message);
    const { downlineUsers } = await this.userService.getSubUsers(
      Number(user.id),
      '0', // todo: add path(upline path) if required
      {},
    );
    return await this.prisma.$transaction(async (tx) => {
      const sportsPermission = await tx.sportsPermission.upsert({
        where: { userId: user.id },
        update: { permission: JSON.parse(JSON.stringify(permission.data)) },
        create: {
          userId: user.id,
          permission: JSON.parse(JSON.stringify(permission.data)),
        },
      });
      for (const downlineUser of downlineUsers) {
        await tx.sportsPermission.upsert({
          where: { userId: downlineUser.id },
          update: { permission: JSON.parse(JSON.stringify(permission.data)) },
          create: {
            userId: downlineUser.id,
            permission: JSON.parse(JSON.stringify(permission.data)),
          },
        });
      }
      return sportsPermission;
    });
  }

  async getSportsPermission(userId: bigint | number) {
    return await this.prisma.sportsPermission.findUnique({
      where: {
        userId,
      },
    });
  }

  async checkPermission(userId: bigint | number, sport: string) {
    const permission = await this.prisma.sportsPermission.findUnique({
      where: { userId },
    });
    if (
      !permission ||
      !Array.isArray(permission.permission) ||
      permission.permission.length === 0
    )
      return true;

    const userPermissions = JSON.parse(
      JSON.stringify(permission.permission),
    ) as PermissionDto[];
    const gamePermission = userPermissions.find(
      (p: PermissionDto) => p.name.toLowerCase() === sport.toLowerCase(),
    );
    if (!gamePermission) return true;
    if (gamePermission.allowed) return true;
    return false;
  }

  async validate(
    updatedBy: bigint,
    userType: UserType,
    permissions: PermissionDto[],
    // transactionCode: string,
  ) {
    try {
      if (userType === UserType.Admin) {
        // const adminMeta = await this.adminService.getMetaById(updatedBy);
        // if (adminMeta.transactionCode !== transactionCode)
        //   return { success: false, message: 'Wrong transaction code' };
        return { success: true, message: '' };
      }
      const user = await this.userService.getById(updatedBy);
      // const userMeta = await this.userService.getMetaById(updatedBy);
      // if (userMeta.transactionCode !== transactionCode)
      //   return { success: false, message: 'Wrong transaction code' };
      const sportPermission = await this.prisma.sportsPermission.findUnique({
        where: { userId: user.id },
      });
      if (!sportPermission || !sportPermission.permission)
        return { success: true, message: '' };

      const userPermission = JSON.parse(
        JSON.stringify(sportPermission.permission),
      ) as PermissionDto[];

      if (!Array.isArray(userPermission)) return { success: true, message: '' };
      const allowedPermission = userPermission
        .filter((permission) => permission.allowed)
        .map((p) => p.name.toLowerCase());
      for (const permission of permissions) {
        if (permission.allowed) {
          if (!allowedPermission.includes(permission.name.toLowerCase())) {
            return { success: false, message: 'You have not permission' };
          }
        }
      }
      return { success: true, message: '' };
    } catch (error) {
      this.logger.warn(`Error to validate sports permission ${error.message}`);
      return { success: false, message: 'You have not permission' };
    }
  }
}
