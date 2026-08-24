import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { MasterDataImportService } from './master-data-import.service';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';

@Module({
  imports: [PrismaModule],
  controllers: [MasterDataController],
  providers: [
    MasterDataService,
    {
      provide: MasterDataImportService,
      useFactory: (prisma: PrismaService) =>
        new MasterDataImportService(prisma),
      inject: [PrismaService],
    },
  ],
})
export class MasterDataModule {}
