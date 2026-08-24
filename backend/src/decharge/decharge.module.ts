import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QrModule } from '../qr/qr.module';
import { DechargeController } from './decharge.controller';
import { DechargeService } from './decharge.service';

@Module({
  imports: [PrismaModule, QrModule],
  controllers: [DechargeController],
  providers: [DechargeService],
})
export class DechargeModule {}
