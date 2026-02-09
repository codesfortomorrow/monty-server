import { PassportStrategy } from '@nestjs/passport';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Strategy } from 'passport-local';
import { UserType, ValidatedUser } from '@Common';
import { LOCAL_AUTH } from '../auth.constants';
import { UsersService } from '../../users';
import { AdminService } from '../../admin';
import { CaptchaService } from 'src/captcha/captcha.service';
import { Request } from 'express';
import { ActivityService } from 'src/activity';
import { LoginStatus, UserStatus } from '@prisma/client';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, LOCAL_AUTH) {
  constructor(
    private readonly usersService: UsersService,
    private readonly adminService: AdminService,
    private readonly captchaService: CaptchaService,
    private readonly activityService: ActivityService,
  ) {
    super({
      usernameField: 'username',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    username: string,
    password: string,
    // captchaId: string,
    // captchaText: string,
  ): Promise<ValidatedUser> {
    const { device } = req.body;
    // const { captchaId, captchaText } = req.body;
    // if (!captchaId || !captchaText) {
    //   throw new BadRequestException('Captcha is required');
    // }
    // const isvalidCaptcha = await this.captchaService.verifyCaptcha(
    //   captchaId,
    //   captchaText,
    // );
    // if (!isvalidCaptcha) throw new BadRequestException('Invalid captcha');

    let userId;
    let userType = UserType.User;
    userId = await this.usersService.getByUsername(username);
    if (userId) {
      if (userId.status === UserStatus.Inactive)
        throw new Error('User not found');
      if (userId.status === UserStatus.Suspended)
        throw new Error(
          'Your account has been temporarily suspended. Please contact customer support for assistance',
        );
    }
    if (userId === null) {
      userId = await this.adminService.getByEmail(username);
      if (userId) {
        userType = UserType.Admin;
      }
    }

    let user: false | ValidatedUser | null;
    user = await this.usersService.validateCredentials(password, username);
    if (user === null) {
      user = await this.adminService.validateCredentials(username, password);
    }
    const ip = this.getIp(req);
    if (user) {
      await this.activityService.loginActivity({
        userId: user.id,
        loginStatus: LoginStatus.Success,
        ip,
        userType: user.type,
      });
    } else {
      if (userId) {
        await this.activityService.loginActivity({
          loginStatus: LoginStatus.Failed,
          userId: userId.id,
          userType: userType,
          ip,
        });
      }
    }
    // const ip = this.getIp(req);
    // if (user) {
    //   await this.activityService.loginActivity({
    //     userId: user.id,
    //     loginStatus: LoginStatus.Success,
    //     ip,
    //     userType: user.type,
    //     device,
    //   });
    // } else {
    //   if (userId) {
    //     await this.activityService.loginActivity({
    //       loginStatus: LoginStatus.Failed,
    //       userId: userId.id,
    //       userType: userType,
    //       ip,
    //       device,
    //     });
    //   }
    // }
    if (user) return user;
    if (user === false) throw new UnauthorizedException('Incorrect password');

    throw new UnauthorizedException('User does not exist');
  }

  private getIp(req: Request): string | undefined {
    return (req.headers['x-real-ip'] as string | undefined) || req.ip;
  }
}
