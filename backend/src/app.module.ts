import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminEventsModule } from './admin-events/admin-events.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { ChargeModule } from './charge/charge.module';
import appConfig from './config/app.config';
import { validateEnv } from './config/env.validation';
import { DechargeModule } from './decharge/decharge.module';
import { FaultModule } from './fault/fault.module';
import { HealthModule } from './health/health.module';
import { MasterDataModule } from './master-data/master-data.module';
import { MovementsModule } from './movements/movements.module';
import { PrismaModule } from './prisma/prisma.module';
import { QrModule } from './qr/qr.module';
import { ReportsModule } from './reports/reports.module';
import { StatusModule } from './status/status.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 300 },
      { name: 'login', ttl: 60_000, limit: 5 },
    ]),
    AuthModule,
    AdminEventsModule,
    PrismaModule,
    HealthModule,
    QrModule,
    ChargeModule,
    DechargeModule,
    FaultModule,
    StatusModule,
    MasterDataModule,
    MovementsModule,
    ReportsModule,
    UsersModule,
  ],
  providers: [
    // Order matters: rate limiting runs first, then authentication, then role
    // checks. Registering the auth guard globally makes every route protected
    // unless it opts out with @Public(), so a new endpoint is closed by default.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
