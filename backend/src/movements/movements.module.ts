import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';

@Module({
  imports: [PrismaModule],
  controllers: [MovementsController],
  providers: [MovementsService],
})
export class MovementsModule {}
