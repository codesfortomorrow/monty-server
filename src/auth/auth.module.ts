import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { jwtConfigFactory } from '@Config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy, LocalStrategy } from './strategies';
import { AdminModule } from '../admin';
import { UsersModule } from '../users';
import { OtpModule } from '../otp';
import { CaptchaModule } from 'src/captcha/captcha.module';
import { MfaModule } from 'src/multi-factor-authentication/mfa.module';
import { PrismaModule } from 'src/prisma';
import { ActivityModule } from 'src/activity';
// import { BonusModule } from 'src/bonus/bonus.module';

@Module({
  imports: [
    AdminModule,
    UsersModule,
    OtpModule,
    JwtModule.registerAsync({
      useFactory: (config: ConfigType<typeof jwtConfigFactory>) => ({
        secret: config.secret,
        signOptions: config.signOptions,
      }),
      inject: [jwtConfigFactory.KEY],
    }),
    CaptchaModule,
    ActivityModule,
    MfaModule,
    PrismaModule,
    // BonusModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, GoogleStrategy],
  exports: [AuthService],
})
export class AuthModule {}
