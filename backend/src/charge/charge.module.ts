import { Module } from '@nestjs/common';
import { QrModule } from '../qr/qr.module';
import { ChargeController } from './charge.controller';
import { ChargeService } from './charge.service';

@Module({
  imports: [QrModule],
  controllers: [ChargeController],
  providers: [ChargeService],
})
export class ChargeModule {}
