import { Injectable } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { MFARequestDto } from './dto/mfa.request';
import { UsersService } from 'src/users';
import { PrismaService } from 'src/prisma';
import { AdminService } from 'src/admin';

@Injectable()
export class MfaService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prismaService: PrismaService,
    private readonly adminService: AdminService,
  ) {}
  generateSecret(emailOrUsername: string) {
    const secret = speakeasy.generateSecret({
      name: `MyApp (${emailOrUsername})`,
      length: 20,
    });

    return secret;
  }

  async generateQrCodeDataUrl(otpauthUrl: string) {
    return qrcode.toDataURL(otpauthUrl);
  }

  verifyToken(secret: string, token: string) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1, // allow ±30s
    });
  }

  async setupMFA(data: MFARequestDto) {
    const user = await this.usersService.getByUsername(data.usernameOrEmail);
    const admin = await this.adminService.getByEmail(data.usernameOrEmail);
    if (!user && !admin) throw new Error('User not found');

    if (data.status === 'ACTIVE') {
      const secret = this.generateSecret(data.usernameOrEmail);

      // save secret in DB
      //   await this.usersService.update(user.id, {
      //     mfaSecret: secret.base32,
      //     isMfaEnabled: true,
      //   });
      if (user)
        await this.prismaService.userMeta.update({
          where: { userId: user.id },
          data: {
            mfaSecret: secret.base32,
            isMfaEnabled: true,
          },
        });
      else
        await this.prismaService.adminMeta.update({
          where: { adminId: admin?.id },
          data: {
            mfaSecret: secret.base32,
            isMfaEnabled: true,
          },
        });

      // return QR code (user scans it in Google Authenticator)
      const qrCodeDataUrl = await this.generateQrCodeDataUrl(
        secret.otpauth_url!,
      );

      return {
        qrCode: qrCodeDataUrl,
        secret: secret.base32,
      };
    } else {
      if (user) {
        await this.prismaService.userMeta.update({
          where: { userId: user.id },
          data: {
            isMfaEnabled: false,
          },
        });
      } else
        await this.prismaService.userMeta.update({
          where: { userId: admin?.id },
          data: {
            isMfaEnabled: false,
          },
        });
      return { status: 'INACTIVE' };
    }
  }
}
