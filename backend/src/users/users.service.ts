import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  passwordUpdatedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async list() {
    const users = await this.prismaService.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
      select: { ...USER_SELECT, passwordHash: true },
    });

    return {
      items: users.map(({ passwordHash, ...user }) => ({
        ...user,
        // Never expose the hash; report only whether sign-in is possible.
        canSignIn: passwordHash !== null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        passwordUpdatedAt: user.passwordUpdatedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      })),
      total: users.length,
    };
  }

  async create(input: {
    username: string;
    password: string;
    role: UserRole;
    displayName?: string;
    email?: string;
  }) {
    const username = this.normalizeUsername(input.username);
    AuthService.assertPasswordStrength(input.password);

    try {
      const user = await this.prismaService.user.create({
        data: {
          username,
          email: input.email?.trim() || null,
          displayName: input.displayName?.trim() || null,
          role: input.role,
          isActive: true,
          passwordHash: await AuthService.hashPassword(input.password),
          passwordUpdatedAt: new Date(),
        },
        select: USER_SELECT,
      });

      return { ok: true as const, user };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A user with this username or email already exists',
        );
      }

      throw error;
    }
  }

  /** Administrator-set password, used when a user forgets theirs. */
  async setPassword(id: string, password: string, actingUserId: string) {
    AuthService.assertPasswordStrength(password);

    const user = await this.requireUser(id);

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await AuthService.hashPassword(password),
        passwordUpdatedAt: new Date(),
      },
    });

    return { ok: true as const, id: user.id, changedBy: actingUserId };
  }

  /**
   * Retires a user. The row is kept and only marked deleted, because movements,
   * repairs and audit entries reference it; a hard delete would break history.
   */
  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const user = await this.requireUser(id);

    if (user.role === UserRole.ADMIN) {
      const remainingAdmins = await this.prismaService.user.count({
        where: {
          role: UserRole.ADMIN,
          isActive: true,
          deletedAt: null,
          id: { not: user.id },
        },
      });

      if (remainingAdmins === 0) {
        throw new BadRequestException(
          'Cannot delete the last administrator; create another one first',
        );
      }
    }

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        // Credentials are cleared so the account cannot sign in even if it is
        // later reactivated without an administrator setting a new password.
        passwordHash: null,
      },
    });

    return { ok: true as const, id: user.id };
  }

  private async requireUser(id: string) {
    const user = await this.prismaService.user.findFirst({
      where: { id: id.trim(), deletedAt: null },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('No matching user found');
    }

    return user;
  }

  private normalizeUsername(username: string): string {
    const normalized = (username ?? '').trim().toLowerCase();

    if (!/^[a-z0-9._-]{3,60}$/.test(normalized)) {
      throw new BadRequestException(
        'Username must be 3-60 characters, using letters, numbers, dot, dash or underscore',
      );
    }

    return normalized;
  }
}
