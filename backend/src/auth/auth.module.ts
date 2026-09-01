import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET')?.trim();

        // Startup validation already requires this in production; the guard
        // would otherwise verify tokens against an empty secret.
        if (!secret) {
          throw new Error('JWT_SECRET must be configured to issue tokens.');
        }

        const ttl = Number(
          configService.get<string>('JWT_EXPIRES_IN_SECONDS') ?? '',
        );

        return {
          secret,
          signOptions: {
            expiresIn: Number.isFinite(ttl) && ttl > 0 ? ttl : 12 * 60 * 60,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
