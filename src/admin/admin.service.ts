import { join } from 'node:path';
import { Cache } from 'cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Admin, AdminMeta, AdminStatus, Prisma } from '@prisma/client';
import { adminConfigFactory } from '@Config';
import {
  StorageService,
  UtilsService,
  ValidatedUser,
  UserType,
  getAccessGuardCacheKey,
} from '@Common';
import { PrismaService } from '../prisma';
import { UpdateProfileDetailsRequestDto } from './dto';

@Injectable()
export class AdminService {
  constructor(
    @Inject(adminConfigFactory.KEY)
    private readonly config: ConfigType<typeof adminConfigFactory>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
    private readonly storageService: StorageService,
  ) {}

  private getProfileImageUrl(profileImage: string): string {
    return this.storageService.getFileUrl(
      profileImage,
      this.config.profileImagePath,
    );
  }

  private hashPassword(password: string): { salt: string; hash: string } {
    const salt = this.utilsService.generateSalt(this.config.passwordSaltLength);
    const hash = this.utilsService.hashPassword(
      password,
      salt,
      this.config.passwordHashLength,
    );
    return { salt, hash };
  }

  async isEmailExist(email: string, excludeAdminId?: bigint): Promise<boolean> {
    return (
      (await this.prisma.admin.count({
        where: {
          email: email.toLowerCase(),
          NOT: {
            id: excludeAdminId,
          },
        },
      })) !== 0
    );
  }

  async getById(adminId: bigint): Promise<Admin> {
    return await this.prisma.admin.findUniqueOrThrow({
      where: {
        id: adminId,
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async getByEmail(email: string): Promise<Admin | null> {
    return await this.prisma.admin.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });
  }

  async getMetaById(adminId: bigint | number): Promise<AdminMeta> {
    return await this.prisma.adminMeta.findUniqueOrThrow({
      where: {
        adminId,
      },
    });
  }

  async authenticate(adminId: bigint, password: string): Promise<Admin> {
    const admin = await this.getById(adminId);
    const validation = await this.validateCredentials(admin.email, password);

    if (!validation === null) throw new Error('Admin not found');
    if (validation === false) throw new Error('Incorrect password');

    return admin;
  }

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<ValidatedUser | false | null> {
    const admin = await this.getByEmail(email);
    if (!admin) return null;
    if (admin.status !== AdminStatus.Active) {
      throw new Error(
        'Your account has been temporarily suspended/blocked by the system',
      );
    }

    const adminMeta = await this.getMetaById(admin.id);
    const passwordHash = this.utilsService.hashPassword(
      password,
      adminMeta.passwordSalt || '',
      adminMeta.passwordHash
        ? adminMeta.passwordHash.length / 2
        : this.config.passwordHashLength,
    );

    if (adminMeta.passwordHash === passwordHash) {
      return {
        id: admin.id,
        type: UserType.Admin,
      };
    }

    return false;
  }

  async getProfile(adminId: bigint): Promise<Admin> {
    const admin = await this.getById(adminId);
    if (admin.profileImage) {
      admin.profileImage = this.getProfileImageUrl(admin.profileImage);
    }
    return admin;
  }

  async updateProfileDetails(
    adminId: bigint,
    data: UpdateProfileDetailsRequestDto,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<Admin> {
    const prismaClient = options?.tx ? options.tx : this.prisma;

    const admin = await prismaClient.admin.findUniqueOrThrow({
      where: { id: adminId },
    });
    if (data.email && (await this.isEmailExist(data.email, adminId))) {
      throw new Error('Email already exist');
    }

    return await prismaClient.admin.update({
      data: {
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email && data.email.toLowerCase(),
      },
      where: {
        id: admin.id,
      },
    });
  }

  async updateProfileImage(
    adminId: bigint,
    profileImage: string,
  ): Promise<{ profileImage: string | null }> {
    const admin = await this.getById(adminId);

    return await this.prisma.$transaction(async (tx) => {
      await tx.admin.update({
        where: { id: adminId },
        data: { profileImage },
      });

      // Remove previous profile image from storage
      if (admin.profileImage) {
        await this.storageService.removeFile(
          join(this.config.profileImagePath, admin.profileImage),
        );
      }
      await this.storageService.move(
        profileImage,
        this.config.profileImagePath,
      );

      return {
        profileImage: this.getProfileImageUrl(profileImage),
      };
    });
  }

  async changePassword(
    adminId: bigint,
    oldPassword: string,
    newPassword: string,
  ): Promise<Admin> {
    const admin = await this.getById(adminId);
    const adminMeta = await this.getMetaById(admin.id);

    const hashedPassword = this.utilsService.hashPassword(
      oldPassword,
      adminMeta.passwordSalt || '',
      adminMeta.passwordHash
        ? adminMeta.passwordHash.length / 2
        : this.config.passwordHashLength,
    );

    if (hashedPassword !== adminMeta.passwordHash)
      throw new Error('Password does not match');

    const { salt, hash } = this.hashPassword(newPassword);
    const passwordSalt = salt;
    const passwordHash = hash;

    await this.prisma.adminMeta.update({
      data: {
        passwordHash,
        passwordSalt,
      },
      where: {
        adminId,
      },
    });
    return admin;
  }

  async setStatus(userId: bigint, status: AdminStatus): Promise<Admin> {
    await this.cacheManager.del(
      getAccessGuardCacheKey({ id: userId, type: UserType.Admin }),
    );
    return await this.prisma.admin.update({
      data: { status },
      where: {
        id: userId,
      },
    });
  }

  async getRoleByAdminId(adminId: bigint | number) {
    const admin = await this.prisma.admin.findUniqueOrThrow({
      where: { id: adminId },
      select: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    return admin.role;
  }

  async adminChangeUserPassword(
    requesterUserId: bigint,
    targetUserId: bigint | number,
    newPassword: string,
    userType: UserType,
  ) {
    const targetMeta = await this.prisma.$queryRawUnsafe<
      Array<{ upline: string | null }>
    >(
      `
        SELECT upline::text AS upline FROM user_meta WHERE user_id = $1::bigint
      `,
      targetUserId,
    );

    if (!targetMeta.length || !targetMeta[0].upline) {
      throw new Error('Target user not found or upline missing');
    }

    const targetUpline = targetMeta[0].upline;

    // CASE 1: Admin can change anyone's password
    if (userType === UserType.Admin) {
      return this.updatePassword(targetUserId, newPassword);
    }

    // CASE 2: User – must check level-1 downline

    // Split upline into array of IDs
    const parts = targetUpline.split('.');
    if (parts.length <= 2)
      throw new Error('You can change password only for your level-1 downline');
    const directParentId = BigInt(parts[parts.length - 2]);
    if (directParentId != requesterUserId) {
      throw new Error('You can change password only for your level-1 downline');
    }

    return this.updatePassword(targetUserId, newPassword);
  }

  private async updatePassword(userId: bigint | number, newPassword: string) {
    const { salt, hash } = this.hashPassword(newPassword);
    const transactionCode = this.utilsService.generateTransactionCode();

    await this.prisma.userMeta.update({
      where: { userId: userId },
      data: {
        passwordSalt: salt,
        passwordHash: hash,
        transactionCode: transactionCode.toString(),
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordChanged: false, transactionCodeViewed: false },
    });

    return userId;
  }
  async getByUsername(username: string): Promise<Admin | null> {
    return await this.prisma.admin.findUnique({
      where: {
        email: username,
      },
    });
  }
}
