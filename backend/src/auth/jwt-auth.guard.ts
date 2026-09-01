import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload, AuthenticatedUser } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Rejects any request without a valid bearer token.
 *
 * Registered globally, so routes are protected unless they carry @Public().
 * A newly added endpoint is therefore closed by default: the failure mode of
 * forgetting to annotate is a locked route, not an exposed one.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // The account is re-read on every request so deactivating or deleting a
    // user takes effect immediately, rather than when their token expires.
    const user = await this.prismaService.user.findFirst({
      where: {
        id: payload.sub,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Account is no longer active');
    }

    request.user = user;

    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;

    if (!header) {
      // Browsers cannot set headers on <img> or EventSource requests, so photo
      // and live-event routes accept the token as a query parameter instead.
      const queryToken = (request.query as Record<string, unknown>)
        ?.access_token;

      return typeof queryToken === 'string' && queryToken.trim()
        ? queryToken.trim()
        : null;
    }

    const [scheme, value] = header.split(' ');

    if (!value || scheme.toLowerCase() !== 'bearer') {
      return null;
    }

    return value.trim() || null;
  }
}
