import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminEventsModule } from './admin-events/admin-events.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig],
      validate: validateEnv,
    }),
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
  ],
})
export class AppModule {}
