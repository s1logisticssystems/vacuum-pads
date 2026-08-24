import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QrModule } from '../qr/qr.module';
import { StorageModule } from '../storage/storage.module';
import { FaultController } from './fault.controller';
import { FaultService } from './fault.service';
import { RepairsController } from './repairs.controller';

@Module({
  imports: [PrismaModule, QrModule, StorageModule, NotificationsModule],
  controllers: [FaultController, RepairsController],
  providers: [FaultService],
})
export class FaultModule {}
