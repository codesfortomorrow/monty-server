import { Inject, Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { OtpTransport, User } from '@prisma/client';
import { JwtPayload, UserType, UtilsService } from '@Common';
import { RegisterUserRequestDto, SendCodeRequestType } from './dto';
import { UsersService } from '../users';
import {
  OtpContext,
  OtpService,
  SendCodeResponse,
  VerifyCodeResponse,
} from '../otp';
import { MfaService } from 'src/multi-factor-authentication/mfa.service';
import { AdminService } from 'src/admin';
import { PrismaService } from 'src/prisma';
import { ConfigType } from '@nestjs/config';
import { appConfigFactory } from '@Config';
// import { BonusProcessor } from 'src/bonus/services/bonus.internal.processor';

export type ValidAuthResponse = {
  accessToken: string;
  type: UserType;
};

export type InvalidVerifyCodeResponse = {
  email?: VerifyCodeResponse;
  mobile?: VerifyCodeResponse;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly mfaService: MfaService,
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly utils: UtilsService,

    @Inject(appConfigFactory.KEY)
    private readonly appConfig: ConfigType<typeof appConfigFactory>,
  ) {}

  private generateJwt(payload: JwtPayload, options?: JwtSignOptions): string {
    return this.jwtService.sign(payload, options);
  }

  async sendCode(
    target: string,
    transport: OtpTransport,
    type: SendCodeRequestType,
  ): Promise<SendCodeResponse> {
    if (type === SendCodeRequestType.Register) {
      if (
        transport === OtpTransport.Email &&
        (await this.usersService.isEmailExist(target))
      ) {
        throw new Error('Email already in use');
      }
      if (
        transport === OtpTransport.Mobile &&
        (await this.usersService.isMobileExist(target))
      ) {
        throw new Error('Mobile already in use');
      }

      return await this.otpService.send({
        context: OtpContext.Register,
        target,
        ...(transport === OtpTransport.Email
          ? {
              transport,
              transportParams: {
                username: 'User',
              },
            }
          : { transport }),
      });
    }

    throw new Error('Unknown send code request type found');
  }

  async login(
    userId: bigint,
    type: UserType,
    demoLogin = false,
  ): Promise<ValidAuthResponse> {
    let uplinePath: string | null = null;
    if (type !== UserType.Admin) {
      const result = await this.prisma.$queryRaw<
        { upline: string | null }[]
      >`SELECT upline::text FROM user_meta WHERE user_id = ${userId}`;

      uplinePath = result[0]?.upline;
    } else {
      uplinePath = '0';
    }

    const uniqueKey = this.utils.generateRandomToken(16);

    if (type === UserType.Admin) {
      await this.prisma.admin.update({
        where: { id: userId },
        data: { loginUniqueKey: uniqueKey },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { loginUniqueKey: uniqueKey },
      });
    }

    return {
      accessToken: this.generateJwt(
        {
          sub: userId,
          path: uplinePath!,
          uniqueKey,
          type,
        },
        { expiresIn: demoLogin ? 60 * 60 : '24h' },
      ),
      type,
    };
  }

  async signIn(userId: bigint | number, userType: UserType) {
    let role,
      transactionCode: string | null = null;
    let passwordChanged: boolean | null;
    let isSelfRegistered: boolean | null;
    if (userType === UserType.User || userType === UserType.ResultManager) {
      const userMeta = await this.usersService.getMetaById(userId);
      if (userMeta.isMfaEnabled && userMeta.mfaSecret) {
        return { success: true, mfaRequired: true, userId, accessToken: null };
      }
      role = await this.usersService.getRoleByUserId(userId);
      transactionCode =
        await this.usersService.getTransactionCodeByUserIdBasedOnCondition(
          userMeta.userId,
        );
      const user = await this.usersService.getById(userId);
      passwordChanged = user.passwordChanged;
      isSelfRegistered = user.isSelfRegistered;
    } else {
      const adminMeta = await this.adminService.getMetaById(userId);
      if (adminMeta.isMfaEnabled && adminMeta.mfaSecret) {
        return { success: true, mfaRequired: true, userId, accessToken: null };
      }
      role = await this.adminService.getRoleByAdminId(userId);
      passwordChanged = null;
      isSelfRegistered = null;
    }
    const { accessToken, type } = await this.login(BigInt(userId), userType);
    // this.setAuthCookie(res, accessToken, type);
    return {
      success: true,
      accessToken,
      type,
      role,
      ...(transactionCode ? { transactionCode } : {}),
      ...(passwordChanged !== null ? { passwordChanged } : {}),
      ...(isSelfRegistered !== null ? { isSelfRegistered } : {}),
    };
  }

  async registerUser(
    data: RegisterUserRequestDto,
  ): Promise<InvalidVerifyCodeResponse | ValidAuthResponse> {
    const [verifyEmailOtpResponse, verifyMobileOtpResponse] = await Promise.all(
      [
        data.email &&
          this.otpService.verify(
            data.emailVerificationCode || '',
            data.email,
            OtpTransport.Email,
          ),
        data.mobile &&
          this.otpService.verify(
            data.mobileVerificationCode || '',
            data.mobile,
            OtpTransport.Mobile,
          ),
      ],
    );
    if (
      (verifyEmailOtpResponse && !verifyEmailOtpResponse.status) ||
      (verifyMobileOtpResponse && !verifyMobileOtpResponse.status)
    ) {
      return {
        email: verifyEmailOtpResponse || undefined,
        mobile: verifyMobileOtpResponse || undefined,
      };
    }

    const user = await this.usersService.create({
      firstname: data.firstname,
      lastname: data.lastname,
      email: data.email,
      username: data.username,
      password: data.password,
      dialCode: data.dialCode,
      mobile: data.mobile,
      country: data.country,
      referralCode: data.referralCode,
    });

    // const result = await this.prisma.$queryRaw<
    //   { upline: string | null }[]
    // >`SELECT upline::text FROM user_meta WHERE user_id = ${user.id}`;

    // const uplinePath = result[0]?.upline;

    const uniqueKey = this.utils.generateRandomToken(16);

    return {
      accessToken: this.generateJwt({
        sub: user.id,
        path: user.uplinePath!,
        uniqueKey,
        type: UserType.User,
      }),
      type: UserType.User,
    };
  }

  async forgotPassword(
    email?: string,
    mobile?: string,
  ): Promise<{ email?: SendCodeResponse; mobile?: SendCodeResponse }> {
    return await this.usersService.sendResetPasswordVerificationCode(
      email,
      mobile,
    );
  }

  async resetPassword(
    code: string,
    newPassword: string,
    mobile?: string,
    email?: string,
  ): Promise<User> {
    return await this.usersService.resetPassword(
      code,
      newPassword,
      mobile,
      email,
    );
  }

  async verifyMfaToken(username: string, token: string) {
    const user = await this.usersService.getByUsername(username);
    let userID, userType;
    let verified = false;
    if (user) {
      const userMeta = await this.usersService.getMetaById(user.id);
      if (!userMeta.mfaSecret)
        throw new Error('MFA Secret not found, Please enable MFA again');
      verified = this.mfaService.verifyToken(userMeta.mfaSecret, token);
      userID = user.id;
      userType = UserType.User;
    } else {
      const admin = await this.adminService.getByEmail(username);
      if (!admin) throw new Error('User not found');
      const adminMeta = await this.adminService.getMetaById(admin.id);
      if (!adminMeta.mfaSecret)
        throw new Error('MFA Secret not found, Please enable MFA again');
      verified = this.mfaService.verifyToken(adminMeta.mfaSecret, token);
      userID = admin.id;
      userType = UserType.Admin;
    }
    return { verified, userID, userType };
  }

  async demoLogin() {
    const lastDemoUser = await this.prisma.user.findFirst({
      where: {
        role: {
          name: 'DEMO',
        },
      },
      orderBy: {
        id: 'desc',
      },
    });
    const demoPassword = this.appConfig.demoUserPassword;
    const index =
      lastDemoUser && lastDemoUser.username
        ? Number(lastDemoUser.username.split('-')[1]) + 1
        : 0;
    const username = `DEMOU-${index}`;

    const demoUser = await this.usersService.create({
      firstname: 'DEMO',
      lastname: 'USER',
      username,
      password: demoPassword,
      userRoll: 'DEMO',
    });
    return await this.login(demoUser.id, UserType.User, true);
  }

  async dummyLogin100() {
    const demoPassword = this.appConfig.demoUserPassword;
    const loggedInUsers: any[] = [];

    const lastDummyUser = await this.prisma.user.findFirst({
      where: {
        role: {
          name: 'DEMO',
        },
      },
      orderBy: {
        id: 'desc',
      },
    });

    let index =
      lastDummyUser && lastDummyUser.username
        ? Number(lastDummyUser.username.split('-')[1]) + 1
        : 0;

    for (let i = 0; i < 100; i++) {
      const username = `DUMMY-${index + i}`;

      const dummyUser = await this.usersService.create({
        firstname: 'DEMO',
        lastname: 'USER',
        username,
        password: demoPassword,
        userRoll: 'DEMO',
      });

      const loggedInUser = await this.login(dummyUser.id, UserType.User, true);
      loggedInUsers.push(loggedInUser);
    }

    return loggedInUsers;
  }
}
