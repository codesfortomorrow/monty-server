import { join } from 'node:path';
import { Cache } from 'cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ExportFormat,
  ExportStatus,
  ExportType,
  OtpTransport,
  Prisma,
  RequestStatus,
  User,
  UserMeta,
  UserStatus,
  WalletTransactionContext,
  WalletType,
} from '@prisma/client';
import {
  Pagination,
  StorageService,
  UserType,
  UtilsService,
  ValidatedUser,
  getAccessGuardCacheKey,
} from '@Common';
import { appConfigFactory, userConfigFactory } from '@Config';
import { PrismaService } from '../prisma';
import {
  OtpContext,
  OtpService,
  SendCodeResponse,
  VerifyCodeResponse,
} from '../otp';
import { WalletsService } from 'src/wallets/wallets.service';
import {
  ChangeUserPasswordRequest,
  CreateSubUserRequest,
  GetSubuserRequest,
  GetSummaryRequest,
  GetUsersRequestDto,
  UpdateProfileDetailsRequestDto,
  UpdateUserProfileRequestDto,
} from './dto';
import { AdminService } from 'src/admin';
import crypto from 'crypto';
// import { BonusProcessor } from 'src/bonus/services/bonus.internal.processor';
type UserWithUpline<T> = T & { upline: string };
import { getStatusPriorityLevel } from 'src/utils/user-status';
import { use } from 'passport';

@Injectable()
export class UsersService {
  constructor(
    @Inject(userConfigFactory.KEY)
    private readonly config: ConfigType<typeof userConfigFactory>,
    @Inject(appConfigFactory.KEY)
    private readonly appConfig: ConfigType<typeof appConfigFactory>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
    private readonly storageService: StorageService,
    private readonly otpService: OtpService,
    private readonly walletService: WalletsService,
    private readonly adminService: AdminService,
    // private readonly bonusProcessor: BonusProcessor,
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

  private isValidUsername(username: string): boolean {
    return /^[a-z][a-z0-9_]{3,20}$/.test(username);
  }

  async isEmailExist(email: string, excludeUserId?: bigint): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          email: email.toLowerCase(),
          NOT: {
            id: excludeUserId,
          },
        },
      })) !== 0
    );
  }

  async isUsernameExist(
    username: string,
    excludeUserId?: bigint,
  ): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          username,
          NOT: {
            id: excludeUserId,
          },
        },
      })) !== 0
    );
  }

  async isMobileExist(
    mobile: string,
    excludeUserId?: bigint,
  ): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          mobile,
          NOT: {
            id: excludeUserId,
          },
        },
      })) !== 0
    );
  }

  async getById(userId: bigint | number): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
        deletedAt: null,
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
    if (!user) throw new Error('User not found');
    return user;
  }

  async getByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });
  }

  async getByUsername(username: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: {
        username: username,
      },
    });
  }

  async getByMobile(mobile: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: {
        mobile,
      },
    });
  }

  async getMetaById(userId: bigint | number): Promise<UserMeta> {
    const meta = await this.prisma.userMeta.findUnique({
      where: {
        userId,
      },
    });
    if (!meta) throw new Error("User's meta details not found");
    return meta;
  }
  //   async getUplinePathByIdInstring(userId: bigint | number): Promise<string | null> {
  //   const result = await this.prisma.$queryRaw<
  //     { upline: string | null }[]
  //   >`
  //     SELECT upline::text AS upline
  //     FROM user_meta
  //     WHERE user_id = ${BigInt(userId)}
  //     LIMIT 1
  //   `;
  //   return result?.[0]?.upline ?? null;
  // }

  async getUplinePathById(userId: bigint | number) {
    const uplineResult = await this.prisma.$queryRawUnsafe<
      { upline: string | null }[]
    >(
      `SELECT upline::text AS upline FROM user_meta WHERE user_id = $1::bigint`,
      userId,
    );

    if (uplineResult.length === 0)
      throw new Error("User's upline path not found");

    return uplineResult[0].upline;
  }

  async getMetaByEmail(email: string): Promise<UserMeta> {
    return await this.prisma.userMeta.findFirstOrThrow({
      where: {
        user: {
          email: email.toLowerCase(),
        },
      },
    });
  }

  async validateCredentials(
    password: string,
    username?: string,
    email?: string,
  ): Promise<ValidatedUser | false | null> {
    let user;
    if (email) user = await this.getByEmail(email);
    if (username) user = await this.getByUsername(username);
    if (!user) return null;
    if (user.deletedAt) {
      throw new Error('This account has been deleted by the admin');
    }
    if (user.status === UserStatus.Inactive) throw new Error('User not found');
    if (user.status === UserStatus.Suspended)
      throw new Error(
        'Your account has been temporarily suspended. Please contact customer support for assistance',
      );

    const userMeta = await this.getMetaById(user.id);
    const passwordHash = this.utilsService.hashPassword(
      password,
      userMeta.passwordSalt || '',
      userMeta.passwordHash
        ? userMeta.passwordHash.length / 2
        : this.config.passwordHashLength,
    );
    if (userMeta.passwordHash === passwordHash) {
      return {
        id: user.id,
        type: UserType.User,
      };
    }

    return false;
  }

  async create(data: {
    firstname?: string;
    lastname?: string;
    username?: string;
    email?: string;
    password?: string;
    dialCode?: string;
    mobile?: string;
    country?: string;
    googleId?: string;
    profileImage?: string;
    referralCode?: string;
    userRoll?: string;
  }) {
    if (data.email) {
      if (await this.isEmailExist(data.email)) {
        throw new Error('Email already exist');
      }
    }
    if (data.mobile && (await this.isMobileExist(data.mobile))) {
      throw new Error('Mobile already exist');
    }

    if (data.username) {
      if (await this.isUsernameExist(data.username)) {
        throw new Error('Username already exist');
      }
    }

    let passwordSalt = null;
    let passwordHash = null;
    if (data.password) {
      const { salt, hash } = this.hashPassword(data.password);
      passwordSalt = salt;
      passwordHash = hash;
    }

    const userRole = await this.prisma.role.findFirst({
      where: { name: data.userRoll ?? 'USER' },
    });

    let affiliateResult = null;
    if (data.referralCode?.trim()) {
      affiliateResult = await this.validateReferralCode(data.referralCode);
    }

    if (!userRole) throw new Error('User role not found');
    const referralCode = await this.generateUniqueReferralCode();
    const newUser = await this.prisma.$transaction(async (tx) => {
      let basePath: string = '0';
      let uplineId: string = '0';

      if (affiliateResult && affiliateResult.isAffiliate) {
        const affiliateUpline = await this.getUplinePathById(
          affiliateResult.referrerUserId,
        );
        if (!affiliateUpline)
          throw new Error('Affiliate reffreal code is incorrect');

        basePath = affiliateUpline;
        uplineId = affiliateResult.referrerUserId.toString();
      }

      if (data.userRoll === 'DEMO') {
        basePath = 'demo';
      }

      if (data.userRoll === 'RESULT MANAGER') {
        basePath = 'result';
      }

      const user = await tx.user.create({
        data: {
          firstname: data.firstname,
          lastname: data.lastname,
          ...(data.email && { email: data.email.toLowerCase() }),
          ...(data.username && { username: data.username }),
          dialCode: data.dialCode,
          mobile: data.mobile,
          profileImage: data.profileImage,
          country: data.country,
          referralCode,
          isSelfRegistered: true,
          meta: {
            create: {
              passwordHash,
              passwordSalt,
              googleId: data.googleId,
              uplineId: uplineId,
            },
          },
          roleId: userRole.id,
        },
      });

      const uplinePath = `${basePath}.${user.id}`;
      await tx.$executeRaw`
        UPDATE user_meta
        SET upline = text2ltree(${uplinePath})
        WHERE user_id = ${user.id};
      `;

      // Create user wallet
      await this.walletService.create(user.id, { tx });
      if (userRole.name === 'DEMO')
        await this.walletService.addBalance(
          user.id,
          new Prisma.Decimal(1000),
          WalletType.Main,
          false,
          {
            tx,
            context: WalletTransactionContext.SystemDeposit,
            narration: `Demo account initial deposit`,
          },
        );

      if (user.username) {
        if (userRole.name === 'USER' && user.username.startsWith('DEMO')) {
          await this.walletService.addBalance(
            user.id,
            new Prisma.Decimal(1000000),
            WalletType.Main,
            false,
            {
              tx,
              context: WalletTransactionContext.SystemDeposit,
              narration: `Demo account initial deposit`,
            },
          );
        }
      }

      if (affiliateResult?.isAffiliate && affiliateResult.affiliateId) {
        await this.createAffiliateReferral(
          affiliateResult.affiliateId,
          user.id,
          tx,
        );
      }

      // Refferal Bonus -------------------------------
      // if (data.referralCode) {
      //   this.bonusProcessor.emitReferralEvent(user.id, data.referralCode);
      // }

      return { ...user, uplinePath };
    });

    return newUser;
  }

  async getOrCreateByGoogle(data: {
    googleId: string;
    email: string;
    firstname?: string;
    lastname?: string;
    profileImage?: string;
  }): Promise<ValidatedUser> {
    let user = await this.prisma.user.findFirst({
      where: {
        meta: {
          googleId: data.googleId,
        },
      },
    });
    if (!user) {
      const isEmailExist = await this.isEmailExist(data.email);
      if (isEmailExist) {
        user = await this.prisma.user.update({
          data: {
            meta: {
              update: {
                googleId: data.googleId,
              },
            },
          },
          where: { email: data.email.toLowerCase() },
        });
      } else {
        user = await this.create({
          firstname: data.firstname || '',
          lastname: data.lastname || '',
          email: data.email,
          profileImage: data.profileImage,
          googleId: data.googleId,
        });
      }
    }

    return {
      id: user.id,
      type: UserType.User,
    };
  }

  async getProfile(userId: bigint, userType: UserType) {
    //let user;
    let user: UserWithUpline<any>;
    if (userType === UserType.Admin) {
      user = (await this.adminService.getById(userId)) as UserWithUpline<any>;
      user.upline = '0';
    } else {
      user = (await this.getById(userId)) as UserWithUpline<any>;
      user.upline = await this.getUplinePathById(userId);
      user.isAffiliateUser = await this.isAffiliateUser(user.id);
    }
    if (user.profileImage) {
      user.profileImage = this.getProfileImageUrl(user.profileImage);
    }
    return user;
  }

  async updateProfileDetails(
    userId: bigint | number,
    data: UpdateProfileDetailsRequestDto,
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<User> {
    const prismaClient = options?.tx ? options.tx : this.prisma;

    if (data.email && (await this.isEmailExist(data.email, BigInt(userId)))) {
      throw new Error('Email already exist');
    }
    if (data.username && !this.isValidUsername(data.username)) {
      throw new Error('Invalid username');
    }
    if (
      data.username &&
      (await this.isUsernameExist(data.username, BigInt(userId)))
    ) {
      throw new Error('Username already exist');
    }
    if (
      data.mobile &&
      (await this.isMobileExist(data.mobile, BigInt(userId)))
    ) {
      throw new Error('Mobile already exist');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('user not found');

    const [verifyMobileOtpResponse] = await Promise.all(
      // verifyEmailOtpResponse,
      [
        // data.email &&
        //   user.email !== data.email &&
        //   this.otpService.verify(
        //     data.emailVerificationCode || '',
        //     data.email,
        //     OtpTransport.Email,
        //   ),
        data.mobile &&
          user.mobile !== data.mobile &&
          this.otpService.verify(
            data.mobileVerificationCode || '',
            data.mobile,
            OtpTransport.Mobile,
          ),
      ],
    );
    if (
      // (verifyEmailOtpResponse && !verifyEmailOtpResponse.status) ||
      verifyMobileOtpResponse &&
      !verifyMobileOtpResponse.status
    ) {
      // if (
      //   data.email &&
      //   verifyEmailOtpResponse &&
      //   !verifyEmailOtpResponse.status
      // )
      //   throw new Error('Otp not matched');
      if (
        data.mobile &&
        verifyMobileOtpResponse &&
        !verifyMobileOtpResponse.status
      )
        throw new Error('Otp not matched');
    }

    return await prismaClient.user.update({
      data: {
        username: data.username && data.username.toLowerCase(),
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email && data.email.toLowerCase(),
        dialCode: data.dialCode,
        mobile: data.mobile,
        country: data.country,
      },
      where: {
        id: userId,
      },
    });
  }

  async updateProfileDetailsByAdministrator(
    userId: bigint | number,
    data: UpdateUserProfileRequestDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.updateProfileDetails(userId, data, { tx });

      if (data.password) {
        const { salt, hash } = this.hashPassword(data.password);
        const passwordSalt = salt;
        const passwordHash = hash;

        await tx.userMeta.update({
          data: {
            passwordHash,
            passwordSalt,
          },
          where: {
            userId: userId,
          },
        });
      }

      return user;
    });
  }

  async updateProfileImage(
    userId: bigint,
    profileImage: string,
  ): Promise<{ profileImage: string | null }> {
    const user = await this.getById(userId);

    return await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { profileImage },
      });

      if (user.profileImage) {
        // Remove previous profile image from storage
        await this.storageService.removeFile(
          join(this.config.profileImagePath, user.profileImage),
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
    userId: bigint,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.getById(userId);
    const userMeta = await this.getMetaById(user.id);

    const hashedPassword = this.utilsService.hashPassword(
      oldPassword,
      userMeta.passwordSalt || '',
      userMeta.passwordHash
        ? userMeta.passwordHash.length / 2
        : this.config.passwordHashLength,
    );

    if (hashedPassword !== userMeta.passwordHash)
      throw new Error('The old password you entered is incorrect');

    if (oldPassword === newPassword)
      throw new Error('New password must be different from the old password');
    const { salt, hash } = this.hashPassword(newPassword);
    const passwordSalt = salt;
    const passwordHash = hash;

    const isFirstTime = !user.passwordChanged;

    await this.prisma.userMeta.update({
      data: {
        passwordHash,
        passwordSalt,
      },
      where: {
        userId,
      },
    });

    if (isFirstTime) {
      await this.prisma.user.update({
        data: {
          passwordChanged: true,
        },
        where: {
          id: userId,
        },
      });
    }
    return user;
  }

  async sendResetPasswordVerificationCode(email?: string, mobile?: string) {
    let user: User | null | undefined;

    if (email) user = await this.getByEmail(email);
    if (!user && mobile) user = await this.getByMobile(mobile);
    if (!user) throw new Error('User does not exist');

    const response: { email?: SendCodeResponse; mobile?: SendCodeResponse } =
      {};

    if (mobile) {
      response.mobile = await this.otpService.send({
        context: OtpContext.ResetPassword,
        target: mobile,
        transport: OtpTransport.Mobile,
      });
    }
    if (email) {
      response.email = await this.otpService.send({
        context: OtpContext.ResetPassword,
        target: email,
        transport: OtpTransport.Email,
        transportParams: {
          username:
            user.firstname && user.lastname
              ? user.firstname.concat(' ', user.lastname)
              : (user.username ?? ''),
        },
      });
    }

    return response;
  }

  async resetPassword(
    code: string,
    newPassword: string,
    mobile?: string,
    email?: string,
  ): Promise<User> {
    // Get user
    let user: User | null | undefined;
    if (email) {
      user = await this.getByEmail(email);
    }
    if (!user && mobile) {
      user = await this.getByMobile(mobile);
    }
    if (!user) throw new Error('User not found');

    // Validate code
    let response: VerifyCodeResponse | null | undefined;

    if (mobile)
      response = await this.otpService.verify(
        code,
        mobile,
        OtpTransport.Mobile,
      );
    if (email)
      response = await this.otpService.verify(code, email, OtpTransport.Email);
    if (!response) throw new Error('Invalid email or mobile');
    if (response.status === false)
      throw new Error('Incorrect verification code');

    // Reset password
    const { salt: passwordSalt, hash: passwordHash } =
      this.hashPassword(newPassword);

    await this.prisma.userMeta.update({
      data: {
        passwordSalt,
        passwordHash,
      },
      where: { userId: user.id },
    });
    return user;
  }

  async setStatus(userId: bigint, status: UserStatus): Promise<User> {
    await this.cacheManager.del(
      getAccessGuardCacheKey({ id: userId, type: UserType.User }),
    );
    return await this.prisma.user.update({
      data: { status },
      where: {
        id: userId,
      },
    });
  }

  async getAll(options?: GetUsersRequestDto): Promise<{
    count: number;
    skip: number;
    take: number;
    data: User[];
  }> {
    const search = options?.search?.trim();
    const pagination = { skip: options?.skip || 0, take: options?.take || 10 };
    const where: Prisma.UserWhereInput = {};
    if (search) {
      const buildSearchFilter = (search: string): Prisma.UserWhereInput[] => [
        {
          firstname: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          lastname: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          username: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          mobile: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
      const parts = search.split(' ');
      if (parts.length !== 0) {
        where.AND = [];
        for (const part of parts) {
          if (part.trim()) {
            where.AND.push({
              OR: buildSearchFilter(part.trim()),
            });
          }
        }
      }
    }

    const totalUsers = await this.prisma.user.count({
      where,
    });
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { id: Prisma.SortOrder.asc },
      skip: pagination.skip,
      take: pagination.take,
    });
    const response = await this.utilsService.batchable(users, async (user) => {
      return {
        ...user,
        profileImage: user.profileImage
          ? this.getProfileImageUrl(user.profileImage)
          : null,
      };
    });

    return {
      count: totalUsers,
      skip: pagination.skip,
      take: pagination.take,
      data: response,
    };
  }

  async createSubUser(
    creatorId: bigint,
    dto: CreateSubUserRequest,
    userType: UserType,
  ) {
    // 1️⃣ Fetch creator + role
    let creator;
    let creatorMeta;
    let creatorStatus: UserStatus | null = null;
    if (userType === UserType.User) {
      creator = await this.prisma.user.findUnique({
        where: { id: creatorId },
        include: { role: true },
      });
      creatorMeta = await this.getMetaById(creatorId);
      if (creator) creatorStatus = creator.status;
    } else {
      creator = await this.prisma.admin.findUnique({
        where: { id: creatorId },
        include: { role: true },
      });
      creatorMeta = await this.adminService.getMetaById(creatorId);
    }
    if (!creatorMeta || creatorMeta.transactionCode !== dto.transactionCode)
      throw new Error('Wrong transaction code');
    if (!creator?.role) throw new Error('Creator role not found');

    const targetRole = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!targetRole) throw new Error('Invalid target role');

    // 2️⃣ Role validation: Admin cannot create same or higher role
    if (creator.role.level >= targetRole.level)
      throw new Error(`You cannot create user with role "${targetRole.name}"`);
    if (userType === UserType.User && 'partnership' in creator) {
      if (creator.partnership && creator.partnership >= (dto.partnership ?? 0))
        throw new Error(
          `Sub-user partnership must be lower than your partnership (${creator.partnership}%)`,
        );
    }
    // 3️⃣ Create user + meta (no upline yet)
    const salt = await this.utilsService.generateSalt();
    const hash = await this.utilsService.hashPassword(
      dto.password,
      salt,
      this.config.passwordHashLength,
    );
    if (dto.username) {
      const exists = await this.prisma.user.findFirst({
        where: { username: dto.username },
      });
      if (exists) throw new Error('Username already exist');
    }

    if (dto.mobile) {
      const exists = await this.prisma.user.findFirst({
        where: { mobile: dto.mobile },
      });
      if (exists) throw new Error('Mobile number already exist');
    }
    if (dto.email) {
      const exists = await this.prisma.user.findFirst({
        where: { email: dto.email },
      });
      if (exists) throw new Error('Email already exist');
    }
    const referralCode = await this.generateUniqueReferralCode();
    const transactionCode = this.utilsService.generateTransactionCode();
    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          firstname: dto.firstname,
          lastname: dto.lastname,
          // email: dto.email,
          username: dto.username,
          mobile: dto.mobile,
          roleId: dto.roleId,
          status: creatorStatus ?? UserStatus.Active,
          passwordChanged: false,
          transactionCodeViewed: false,
          referralCode,
          partnership: dto.partnership || 0,
          meta: {
            create: {
              passwordSalt: salt,
              passwordHash: hash,
              transactionCode: transactionCode.toString(),
              uplineId: userType === UserType.User ? creatorId.toString() : '0',
            },
          },
        },
      });

      // 4️⃣ Get creator's upline path using raw query
      const creatorUplineResult = await tx.$queryRawUnsafe<
        { upline: string | null }[]
      >(
        `SELECT upline::text AS upline FROM user_meta WHERE user_id = $1::bigint`,
        creatorId,
      );

      const creatorUpline = creatorUplineResult[0]?.upline;

      // 5️⃣ Build new upline path
      let newUpline = creatorUpline
        ? `${creatorUpline}.${newUser.id}`
        : `0.${newUser.id}`;

      if (userType === UserType.Admin) newUpline = `0.${newUser.id}`;

      // 6️⃣ Update upline + upline_id
      await tx.$executeRawUnsafe(
        `
        UPDATE user_meta
        SET upline = text2ltree($1::text)
        WHERE user_id = $2
      `,
        newUpline,
        newUser.id,
      );

      // 7️⃣ Create Wallet
      await this.walletService.create(newUser.id, { tx });

      // 8️⃣ Return user info with role
      const result = await tx.user.findUnique({
        where: { id: newUser.id },
        include: { role: true },
      });

      if (dto.creditLimit && result) {
        await this.walletService.giveCreditLimit({
          userId: newUser.id,
          creatorId: creator.id,
          userType,
          amount: new Prisma.Decimal(dto.creditLimit),
          options: { tx, context: WalletTransactionContext.SystemDeposit },
        });
      }

      if (userType === UserType.User) {
        const sportsPermission = await tx.sportsPermission.findUnique({
          where: { userId: creator.id },
        });
        if (sportsPermission && sportsPermission.permission)
          await tx.sportsPermission.create({
            data: {
              userId: newUser.id,
              permission: sportsPermission.permission,
            },
          });
      }

      return {
        ...result,
        upline: newUpline,
      };
    });
  }

  async getSubUsers(
    userId: number,
    basePath: string,
    query: GetSubuserRequest,
    userType = UserType.User,
    isDownlineBalanceInformationNeeded = false,
    isExport = false,
  ) {
    let take: number | undefined = undefined,
      skip: number | undefined = undefined;
    if (
      query.page &&
      query.limit &&
      !isNaN(query.limit) &&
      !isNaN(query.page)
    ) {
      query.page = query.page < 1 ? 1 : query.page;
      take = query.limit;
      skip = (query.page - 1) * query.limit;
    }

    let reportLimit = '';
    if (!isExport) {
      reportLimit += 'LIMIT $10 OFFSET $11';
    }

    const UserStatusDB = {
      Active: 'active',
      Blocked: 'blocked',
      Inactive: 'inactive',
      Suspended: 'suspended',
      BetLock: 'bet_lock',
    } as const;

    const fromDate = query.fromDate ?? null;
    const toDate = query.toDate ?? null;
    const search = query.username ?? null;
    const rollId = query.rollId ?? null;
    const statusFilter = query.status ? UserStatusDB[query.status] : null;
    const level = query.level ?? null;

    const isInactiveStatus = query.status === 'Inactive';
    const fromDateColumn = isInactiveStatus
      ? 'u.change_status_at'
      : 'u.created_at';
    const toDateColumn = isInactiveStatus
      ? 'u.change_status_at'
      : 'u.created_at';

    const settlement = query.settlement ?? false;

    const params: any[] = [
      basePath, // $1
      userId, // $2
      level, // $3
      rollId, // $4
      fromDate, // $5
      toDate, // $6
      search, // $7
      statusFilter, // $8
      settlement, // $9  👈 new
    ];

    if (!isExport) {
      params.push(take, skip); // $10, $11
    }

    const downlineUsers = await this.prisma.$queryRawUnsafe<
      {
        id: bigint;
        firstname: string;
        lastname: string;
        username: string | null;
        mobile: string | null;
        email: string | null;
        status: string;
        partnership: number;
        role: string;
        availableBalance: number;
        lockedAmount: number;
        exposureAmount: number;
        creditAmount: number;
        upline: string;
        createdAt: Date;
        isSelfRegistered: boolean;

        totalDepositAmount: number;
        totalWithdrawAmount: number;
        lifetimePl: number;

        downlineBalance: number;
        totalBalance: number;
        playerBalance: number;
        exposure: number;
        referance: number;
        profitLoss: number;
        downlinePl: number;
        downlinePlInPercent: number;
      }[]
    >(
      `
SELECT 
  u.id,
  u.firstname,
  u.lastname,
  u.username,
  u.mobile,
  u.email,
  u.status,
  u.partnership,
  u.is_self_registered AS "isSelfRegistered",
  u.created_at AS "createdAt",
  r.name AS role,

  w.amount AS "availableBalance",
  w.locked_amount AS "lockedAmount",
  w.exposure_amount AS "exposureAmount",
  w.credit_amount AS "creditAmount",
  um.upline::text AS "upline",

  COALESCE(uws.total_deposit_amount, 0) AS "totalDepositAmount",
  COALESCE(uws.total_withdraw_amount, 0) AS "totalWithdrawAmount"

FROM "user" u
JOIN user_meta um ON um.user_id = u.id
JOIN role r ON r.id = u.role_id
JOIN wallets w ON w.user_id = u.id AND w.type = 'main'
LEFT JOIN user_wallet_stat uws ON uws.user_id = u.id

WHERE um.upline <@ text2ltree($1::text)
  AND ($1::text = '0' OR um.user_id != $2::bigint)
  AND r.name != 'DEMO'
  AND ($3::int IS NULL OR nlevel(um.upline) <= nlevel(text2ltree($1::text)) + $3)
  AND ($4::int IS NULL OR r.id = $4::int)

  AND ($5::timestamptz IS NULL OR ${fromDateColumn} >= $5)
  AND ($6::timestamptz IS NULL OR ${toDateColumn} <= $6)
  AND ($7::text IS NULL OR u.username ILIKE '%' || $7 || '%')
  AND ($8::text IS NULL OR u.status = ($8::text)::user_status)

ORDER BY u.created_at DESC
${!isExport ? 'LIMIT $10 OFFSET $11' : ''}
`,
      ...params,
    );

    const totalCount = await this.prisma.$queryRawUnsafe<
      {
        count: bigint;
      }[]
    >(
      `
      SELECT count(*) AS count
      FROM "user" u
        JOIN "user_meta" um ON um.user_id = u.id
        JOIN "role" r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          AND um.user_id != $2::bigint
          AND r.name != 'DEMO'
          AND ($3::int IS NULL OR nlevel(um.upline) <= nlevel(text2ltree($1::text)) + $3)
          AND ($4::int IS NULL OR r.id = $4::int)

          AND ($5::timestamptz IS NULL OR ${fromDateColumn} >= $5)
          AND ($6::timestamptz IS NULL OR ${toDateColumn} <= $6)
          AND ($7::text IS NULL OR u.username ILIKE '%' || $7 || '%')
          AND ($8::text IS NULL OR u.status = ($8::text)::user_status)
      `,
      basePath,
      userId,
      level,
      rollId,
      fromDate,
      toDate,
      search,
      statusFilter,
    );

    let extraBalanceInfo = null;
    if (isDownlineBalanceInformationNeeded) {
      for (const usr of downlineUsers) {
        const summary = await this.getDownlineSummaryForUser(
          usr.id,
          usr.upline,
        );

        usr.exposure = Number(summary.player_exposure || 0);

        usr.downlineBalance =
          Number(summary.total_downline_balance || 0) + usr.exposure;

        usr.totalBalance =
          usr.downlineBalance +
          Number(usr.availableBalance || 0) +
          Number(usr.exposureAmount || 0);

        usr.playerBalance = Number(summary.player_balance || 0);

        usr.downlinePl = usr.totalBalance - Number(usr.creditAmount || 0);

        usr.downlinePlInPercent =
          usr.totalBalance -
          (Number(usr.creditAmount || 0) * (usr.partnership || 100)) / 100;

        usr.referance = usr.totalBalance - Number(usr.creditAmount || 0);
        usr.lifetimePl = usr.totalWithdrawAmount - usr.totalDepositAmount;
      }
    }

    const count = Number(totalCount?.[0]?.count ?? 0);

    const pagination: Pagination = {
      currentPage: query.page ?? 1,
      limit: take ?? count,
      totalItems: count,
      totalPage: Math.ceil(count / (take ?? (count > 1 ? count : 1))),
    };

    return {
      downlineUsers,
      pagination,
    };
  }

  async getSummary(
    userId: number,
    basePath: string,
    query: GetSummaryRequest,
    userType: UserType = UserType.User,
    isExport = false,
  ) {
    // for own
    const summary = await this.prisma.$queryRawUnsafe<
      {
        total_downline_balance: number;
        user_balance: number;
        player_balance: number;
        player_exposure: number;
      }[]
    >(
      `
        WITH downline AS (
          SELECT w.amount, w.exposure_amount, r.name AS role
          FROM wallets w
          JOIN user_meta um ON um.user_id = w.user_id
          JOIN "user" u ON u.id = w.user_id
          JOIN role r ON r.id = u.role_id
          WHERE w.type = 'main'
            AND um.upline <@ text2ltree($1::text)
            AND um.user_id != $2::bigint
            AND r.name != 'DEMO'
        )
        SELECT
          COALESCE((SELECT SUM(amount) FROM downline), 0) AS total_downline_balance,
          COALESCE((SELECT amount FROM wallets WHERE user_id = $2 AND type='main'), 0) AS user_balance,
          COALESCE((SELECT SUM(amount) FROM downline WHERE role = 'USER'), 0) AS player_balance,
          COALESCE((SELECT SUM(exposure_amount) FROM downline WHERE role = 'USER'), 0) AS player_exposure
        `,
      basePath,
      userId,
    );

    const s = summary[0];
    let ownnerBalance = 0;
    if (userType === UserType.Admin) {
      const wallet = await this.walletService.getByAdminId(userId);
      ownnerBalance = Number(wallet.amount);
    }

    const exposure = Number(s.player_exposure || 0);
    const availableBalance =
      userType === UserType.Admin ? ownnerBalance : Number(s.user_balance || 0);
    const downlineBalance = Number(s.total_downline_balance || 0);
    const totalBalance = downlineBalance + Number(availableBalance);
    const playerBalance = Number(s.player_balance || 0);

    return {
      availableBalance,
      downlineBalance,
      totalBalance,
      playerBalance,
      exposure,
    };
  }

  async getDownlineUserWithRoleExceptBanker(data: {
    uplinePath: string;
    userId: bigint;
    search?: string;
    level?: number;
    excludeSelfUser?: boolean;
    page?: number;
    limit?: number;
    isExport?: boolean;
  }) {
    const page = data.page && data.page > 0 ? data.page : 1;
    const limit = data.limit ?? 10;
    const skip = (page - 1) * limit;
    let reportLimit = '';
    if (!data.isExport) {
      reportLimit += 'OFFSET $5 LIMIT $6';
    }

    let excludeQuery = '';
    if (data.excludeSelfUser) {
      excludeQuery += "AND r.name != 'USER'";
    }
    const downlineUsers = await this.prisma.$queryRawUnsafe<
      {
        id: bigint;
        username: string | null;
        status: string;
        role: string;
        upline: string;
        createdAt: Date;
        isSelfRegistered: boolean;
        partnership: number;
      }[]
    >(
      `
        SELECT 
          u.id,
          u.username,
          u.status,
          u.is_self_registered AS isSelfRegistered,
          u.created_at AS "createdAt",
          u.partnership,
          r.name AS "role",
          um.upline::text AS "upline"
        FROM "user" u
        JOIN "user_meta" um ON um.user_id = u.id
        JOIN "role" r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          AND um.user_id != $2::bigint
          AND r.name != 'DEMO'
          AND r.name != 'BANKER'
          ${excludeQuery}
          AND ($3::text IS NULL OR u.username ILIKE '%' || $3 || '%')
          AND ($4::int IS NULL OR nlevel(um.upline) <= nlevel(text2ltree($1::text)) + $4)

        ORDER BY um.upline
        ${reportLimit}
      `,
      data.uplinePath,
      data.userId,
      data.search || null,
      data.level || null,
      skip,
      limit,
    );
    const totalCount = await this.prisma.$queryRawUnsafe<
      {
        count: number;
      }[]
    >(
      `
      SELECT count(*) AS count
      FROM "user" u
        JOIN "user_meta" um ON um.user_id = u.id
        JOIN "role" r ON r.id = u.role_id
        WHERE um.upline <@ text2ltree($1::text)
          AND um.user_id != $2::bigint
          AND r.name != 'DEMO'
          AND r.name != 'BANKER'
          ${excludeQuery}
          AND ($3::text IS NULL OR u.username ILIKE '%' || $3 || '%')
          AND ($4::int IS NULL OR nlevel(um.upline) <= nlevel(text2ltree($1::text)) + $4)
      `,
      data.uplinePath,
      data.userId,
      data.search || null,
      data.level || null,
    );
    const total = Number(totalCount?.[0].count || 0);
    const pagination: Pagination = {
      currentPage: page,
      limit,
      totalItems: total,
      totalPage: Math.ceil(total / limit),
    };
    return { downlineUsers, pagination };
  }

  async generateUniqueReferralCode(): Promise<string> {
    let code: string;
    let exists = true;

    do {
      // Example: 8-character alphanumeric code
      code = crypto.randomBytes(4).toString('hex').toUpperCase();

      // Check if code already exists
      const user = await this.prisma.user.findFirst({
        where: { referralCode: code },
      });
      exists = !!user;
    } while (exists);

    return code;
  }

  // async validateReferralCode(referralCode: string) {
  //   const user = await this.prisma.user.findFirst({
  //     where: { referralCode },
  //     include: { affiliate: true },
  //   });

  //   if (!user) {
  //     throw new Error('Invalid referral code.');
  //   }

  //   const affiliate = user.affiliate?.[0] || null;

  //   if (!affiliate || affiliate.requestStatus !== RequestStatus.Approved) {
  //     return {
  //       isAffiliate: false,
  //       affiliateId: null,
  //       referrerUserId: user.id,
  //     };
  //   }

  //   return {
  //     isAffiliate: true,
  //     affiliateId: affiliate.id,
  //     referrerUserId: user.id,
  //   };
  // }

  async validateReferralCode(referralCode: string) {
    const affiliate = await this.prisma.affiliate.findFirst({
      where: {
        affiliateCode: referralCode,
        deletedAt: null,
        requestStatus: RequestStatus.Approved, // approved
      },
    });

    if (affiliate) {
      return {
        isAffiliate: true,
        affiliateId: affiliate.id,
        referrerUserId: affiliate.userId,
      };
    }

    const user = await this.prisma.user.findFirst({
      where: {
        referralCode,
        deletedAt: null,
        status: UserStatus.Active,
      },
    });

    if (user) {
      return {
        isAffiliate: false,
        affiliateId: null,
        referrerUserId: user.id,
      };
    }

    throw new Error('Invalid referral code.');
  }

  async createAffiliateReferral(
    affiliateId: bigint, // ⚠ expects bigint
    referredUserId: bigint,
    tx?: any,
  ) {
    const prisma = tx ?? this.prisma;

    return await prisma.affiliateReferral.create({
      data: {
        affiliateId,
        referredUserId,
        commissionEarned: 0,
      },
    });
  }

  async getRoleByUserId(userId: bigint | number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return user.role;
  }

  async getRoleAndUsernameByUserId(userId: bigint | number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return user;
  }

  async changeStatusForUserAndDownline(
    actorId: bigint,
    targetUserId: bigint,
    newStatus: UserStatus,
    actorType: UserType = UserType.User,
  ) {
    let basePath: string;
    if (actorType === UserType.Admin) {
      basePath = '0';
    } else {
      basePath = (await this.getUplinePathById(actorId)) ?? '';
      if (!basePath && basePath !== '0')
        throw new Error('Actor upline not found');
      const actorUser = await this.getById(actorId);
      if (actorUser.status !== UserStatus.Active)
        throw new Error('You have not permission');
    }

    const targetUpline = (await this.getUplinePathById(targetUserId)) ?? '';
    if (!targetUpline) throw new Error('Target upline not found');

    const isDirect = targetUpline === `${basePath}.${targetUserId}`;

    if (!isDirect) {
      throw new Error('You do not have permission to update this user');
    }

    // if (
    //   actorType !== UserType.Admin &&
    //   !targetUpline.startsWith(`${basePath}.`) &&
    //   actorId.toString() !== targetUserId.toString()
    // ) {
    //   throw new Error('You do not have permission to update this user');
    // }

    let statusValue = newStatus.toString().toLowerCase(); // 'active', 'blocked', etc.

    if (statusValue === 'betlock') statusValue = 'bet_lock';

    await this.prisma.$executeRawUnsafe(
      `
        UPDATE "user" u
      SET status = $1::user_status, status_changed_by = $2::bigint,
      change_status_at = NOW()
      FROM user_meta um
      WHERE u.id = um.user_id
        AND um.upline <@ text2ltree($3)
        AND (u.status_changed_by = $2::bigint OR (
          CASE u.status
            WHEN 'inactive' THEN ${getStatusPriorityLevel(UserStatus.Inactive)}
            WHEN 'suspended' THEN ${getStatusPriorityLevel(UserStatus.Suspended)}
            WHEN 'blocked' THEN ${getStatusPriorityLevel(UserStatus.Blocked)}
            WHEN 'bet_lock' THEN ${getStatusPriorityLevel(UserStatus.BetLock)}
            WHEN 'active' THEN ${getStatusPriorityLevel(UserStatus.Active)}
          END
          >=
          CASE $1::user_status
            WHEN 'inactive' THEN ${getStatusPriorityLevel(UserStatus.Inactive)}
            WHEN 'suspended' THEN ${getStatusPriorityLevel(UserStatus.Suspended)}
            WHEN 'blocked' THEN ${getStatusPriorityLevel(UserStatus.Blocked)}
            WHEN 'bet_lock' THEN ${getStatusPriorityLevel(UserStatus.BetLock)}
            WHEN 'active' THEN ${getStatusPriorityLevel(UserStatus.Active)}
          END
        ));
        `,
      statusValue,
      actorId,
      targetUpline,
    );

    return { message: 'Status updated for user and all downline users.' };
  }

  async getAccountSummary(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
        role: {
          NOT: {
            name: 'DEMO',
          },
        },
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        wallets: true,
      },
    });

    if (!user) throw new Error('User not found');

    const meta = await this.prisma.$queryRawUnsafe<
      { upline: string | null }[]
    >(`
        SELECT upline::text 
        FROM user_meta 
        WHERE user_id = ${userId};
      `);

    const uplinePath = meta?.[0]?.upline || null;

    let uplineId: string | null = null;

    const uplineMap: Record<string, string> = {};

    if (uplinePath) {
      // ltree comes like: '0.5.10.200'
      const uplineIds = uplinePath.split('.');
      if (uplineIds.length > 1) uplineId = uplineIds[uplineIds.length - 2];

      uplineIds.shift(); // Remove Owner
      uplineIds.pop(); // Remove Self
      const ownRole = await this.getRoleByUserId(userId);

      for (const uplineId of uplineIds) {
        const user = await this.getRoleAndUsernameByUserId(BigInt(uplineId));

        if (
          user.role &&
          ownRole &&
          ownRole.name !== user.role.name &&
          user.username
        ) {
          uplineMap[user.role.name] = user.username;
        }
      }
    }

    let upline: {
      id: bigint;
      username?: string | null;
      firstname: string | null;
      lastname: string | null;
      role?: {
        id?: number | null;
        name?: string | null;
      } | null;
    } | null = null;

    if (uplineId === '0') {
      upline = await this.prisma.admin.findFirst({
        include: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    } else if (uplineId) {
      // normal user
      upline = await this.prisma.user.findUnique({
        where: { id: BigInt(uplineId) },
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
    return {
      ...user,
      upline,
      uplineMap,
    };
  }

  async hasRole(userId: bigint, roleName: string): Promise<boolean> {
    if (!roleName?.trim()) return false;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: { select: { name: true } },
      },
    });

    return !!user?.role && user.role.name === roleName;
  }

  async updatePasswordByUserId(
    requesterId: bigint,
    userId: bigint | number,
    dto: ChangeUserPasswordRequest,
    userType: UserType,
  ) {
    // const requestUserMeta = await this.getMetaById(requesterId);
    // if (
    //   !requestUserMeta ||
    //   requestUserMeta.transactionCode !== dto.transactionCode
    // )
    //   throw new Error('Wrong transaction code');
    const user = await this.adminService.adminChangeUserPassword(
      requesterId,
      userId,
      dto.newPassword,
      userType,
    );

    return user;
  }

  async markTransactionCodeViewed(userId: bigint) {
    const user = await this.getById(userId);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { transactionCodeViewed: true },
    });
  }

  async getTransactionCodeByUserIdBasedOnCondition(userId: bigint) {
    const user = await this.getById(userId);
    const userMeta = await this.getMetaById(user.id);
    if (user.passwordChanged && !user.transactionCodeViewed)
      return userMeta.transactionCode;
    return null;
  }

  async exportSubUserReport(
    userId: bigint,
    userType: UserType,
    query: GetSubuserRequest,
  ) {
    const isAdmin = userType === UserType.Admin;

    const exportEntry = await this.prisma.export.create({
      data: {
        timestamp: new Date(),
        type: ExportType.subUsersReport, // ensure enum exists
        format: query.exportFormat ?? ExportFormat.Excel,
        status: ExportStatus.Pending,
        userId: isAdmin ? undefined : userId,
        adminId: isAdmin ? userId : undefined,
        name: query.fileName ?? 'InActive Members List',
        filters: {
          userType,
          level: query.level,
          searchbyuserId: Number(userId),
          rollId: query.rollId,
          username: query.username,
          fromDate: query.fromDate?.toISOString(),
          toDate: query.toDate?.toISOString(),
          status: query.status,
        },
      },
    });

    return {
      message: 'Your sub-user report export has been successfully initiated',
      exportId: exportEntry.id,
      status: exportEntry.status,
      success: true,
    };
  }
  private async getDownlineSummaryForUser(userId: bigint, uplinePath: string) {
    const result = await this.prisma.$queryRawUnsafe<
      {
        total_downline_balance: number;
        player_balance: number;
        player_exposure: number;
      }[]
    >(
      `
    WITH downline AS (
      SELECT
        w.amount,
        w.exposure_amount,
        r.name AS role
      FROM wallets w
      JOIN user_meta um ON um.user_id = w.user_id
      JOIN "user" u ON u.id = w.user_id
      JOIN role r ON r.id = u.role_id
      WHERE w.type = 'main'
        AND um.upline <@ text2ltree($1::text)
        AND um.user_id != $2::bigint
        AND r.name != 'DEMO'
    )
    SELECT
      COALESCE(SUM(amount), 0) AS total_downline_balance,
      COALESCE(SUM(amount) FILTER (WHERE role = 'USER'), 0) AS player_balance,
      COALESCE(SUM(exposure_amount) FILTER (WHERE role = 'USER'), 0) AS player_exposure
    FROM downline
  `,
      uplinePath,
      userId,
    );

    return result[0];
  }

  async isAffiliateUser(userId: bigint) {
    const affiliateCount = await this.prisma.affiliateReferral.count({
      where: {
        referredUserId: userId,
      },
    });
    return affiliateCount > 0;
  }

  async getPartnership(userId: bigint) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
      },
    });

    return user;
  }
}
