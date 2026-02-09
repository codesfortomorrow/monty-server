import { URL } from 'node:url';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import { jwtConfigFactory } from '@Config';
import { AuthenticatedUser, JwtPayload, UserType } from '../types';
import { UtilsService } from '../providers';
import { JWT_AUTH } from '../common.constants';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_AUTH) {
  private static readonly utilsService = new UtilsService(new ConfigService());

  private static readonly prisma = new PrismaClient();

  constructor(
    @Inject(jwtConfigFactory.KEY)
    config: ConfigType<typeof jwtConfigFactory>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.secret as string,
    });
  }

  private static getAuthCookie(ut: UserType) {
    return JwtStrategy.utilsService.getCookiePrefix(ut) + 'authToken';
  }

  private static fromCookie(req: Request): string | null {
    if (req.headers.referer) {
      let authCookie: string | null = null;

      const requestedDomain = new URL(req.headers.referer).host;
      if (
        process.env.ADMIN_WEB_URL &&
        requestedDomain === new URL(process.env.ADMIN_WEB_URL).host
      ) {
        authCookie = JwtStrategy.getAuthCookie(UserType.Admin);
      }

      if (
        process.env.APP_WEB_URL &&
        requestedDomain === new URL(process.env.APP_WEB_URL).host
      ) {
        authCookie = JwtStrategy.getAuthCookie(UserType.User);
      }

      if (authCookie) {
        return req.cookies[authCookie];
      }
    }

    return null;
  }

  async validate(
    payload: JwtPayload & { readonly iat: number; readonly exp: number },
  ): Promise<AuthenticatedUser> {
    if (payload.type === UserType.Admin) {
      // const user = await JwtStrategy.prisma.admin.findFirst({
      //   where: {
      //     id: payload.sub,
      //     loginUniqueKey: payload.uniqueKey,
      //   },
      // });
      // if (!user)
      //   throw new UnauthorizedException(
      //     'Logged out: Your account was accessed from another device.',
      //   );
      return {
        id: payload.sub,
        path: payload.path,
        type: payload.type,
      };
    }
    const user = await JwtStrategy.prisma.user.findFirst({
      where: {
        id: payload.sub,
        loginUniqueKey: payload.uniqueKey,
      },
    });
    // if (!user)
    //   throw new UnauthorizedException(
    //     'Logged out: Your account was accessed from another device.',
    //   );
    return {
      id: payload.sub,
      path: payload.path,
      type: payload.type,
    };
  }
}
