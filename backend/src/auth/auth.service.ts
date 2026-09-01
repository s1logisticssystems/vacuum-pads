import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessTokenPayload,
  AuthenticatedUser,
  LoginResult,
} from './auth.types';

/** Cost factor for password hashing. 12 is a common production baseline. */
const BCRYPT_ROUNDS = 12;

export const MIN_PASSWORD_LENGTH = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  static assertPasswordStrength(password: string): void {
    const value = password ?? '';

    if (value.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
      throw new BadRequestException(
        'Password must contain both letters and numbers',
      );
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const normalizedUsername = (username ?? '').trim().toLowerCase();
    const user = normalizedUsername
      ? await this.prismaService.user.findFirst({
          where: {
            username: normalizedUsername,
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
            passwordHash: true,
          },
        })
      : null;

    // Compare against a dummy hash when the account is missing so that a wrong
    // username and a wrong password take the same time to answer, and neither
    // response reveals which one was wrong.
    const hash =
      user?.passwordHash ??
      '$2a$12$0000000000000000000000000000000000000000000000000000';
    const passwordMatches = await bcrypt.compare(password ?? '', hash);

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Incorrect username or password');
    }

    await this.prismaService.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const authenticated: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };

    return this.issueToken(authenticated);
  }

  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const user = await this.prismaService.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Account cannot change its password');
    }

    const matches = await bcrypt.compare(
      currentPassword ?? '',
      user.passwordHash,
    );

    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    AuthService.assertPasswordStrength(newPassword);

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'New password must differ from the current one',
      );
    }

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await AuthService.hashPassword(newPassword),
        passwordUpdatedAt: new Date(),
      },
    });

    return { ok: true };
  }

  private issueToken(user: AuthenticatedUser): LoginResult {
    const payload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      expiresIn: this.tokenTtlSeconds(),
      user,
    };
  }

  private tokenTtlSeconds(): number {
    const configured = Number(
      this.configService.get<string>('JWT_EXPIRES_IN_SECONDS'),
    );

    return Number.isFinite(configured) && configured > 0
      ? configured
      : 12 * 60 * 60;
  }
}
