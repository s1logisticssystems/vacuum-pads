import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterDataService } from './master-data.service';
import {
  EntityName,
  MasterDataImportService,
} from './master-data-import.service';
import {
  CreateFaultCatalogDto,
  CreateMachineDto,
  CreateRackLocationDto,
  CreateVacuumPadDto,
  UpdateFaultCatalogDto,
  UpdateMachineDto,
  UpdateRackLocationDto,
  UpdateVacuumPadDto,
} from './dto/master-data-write.dto';

@Controller('master-data')
export class MasterDataController {
  constructor(
    private readonly masterDataService: MasterDataService,
    private readonly masterDataImportService: MasterDataImportService,
  ) {}

  @Get('machines')
  listMachines(
    @Query('activeOnly') activeOnly?: string,
    @Query('availableOnly') availableOnly?: string,
  ) {
    return this.masterDataService.listMachines({
      activeOnly,
      availableOnly,
    });
  }

  @Post('machines')
  createMachine(@Body() dto: CreateMachineDto) {
    return this.masterDataService.createMachine(dto);
  }

  @Patch('machines/:id')
  updateMachine(@Param('id') id: string, @Body() dto: UpdateMachineDto) {
    return this.masterDataService.updateMachine(id, dto);
  }

  @Delete('machines/:id')
  deleteMachine(@Param('id') id: string) {
    return this.masterDataService.deleteMachine(id);
  }

  @Get('rack-locations')
  listRackLocations(
    @Query('activeOnly') activeOnly?: string,
    @Query('type') type?: string,
    @Query('availableOnly') availableOnly?: string,
  ) {
    return this.masterDataService.listRackLocations({
      activeOnly,
      availableOnly,
      type,
    });
  }

  @Post('rack-locations')
  createRackLocation(@Body() dto: CreateRackLocationDto) {
    return this.masterDataService.createRackLocation(dto);
  }

  @Patch('rack-locations/:id')
  updateRackLocation(
    @Param('id') id: string,
    @Body() dto: UpdateRackLocationDto,
  ) {
    return this.masterDataService.updateRackLocation(id, dto);
  }

  @Delete('rack-locations/:id')
  deleteRackLocation(@Param('id') id: string) {
    return this.masterDataService.deleteRackLocation(id);
  }

  @Get('fault-catalog')
  listFaultCatalog(@Query('activeOnly') activeOnly?: string) {
    return this.masterDataService.listFaultCatalog({ activeOnly });
  }

  @Post('fault-catalog')
  createFaultCatalogItem(@Body() dto: CreateFaultCatalogDto) {
    return this.masterDataService.createFaultCatalogItem(dto);
  }

  @Patch('fault-catalog/:id')
  updateFaultCatalogItem(
    @Param('id') id: string,
    @Body() dto: UpdateFaultCatalogDto,
  ) {
    return this.masterDataService.updateFaultCatalogItem(id, dto);
  }

  @Delete('fault-catalog/:id')
  deleteFaultCatalogItem(@Param('id') id: string) {
    return this.masterDataService.deleteFaultCatalogItem(id);
  }

  @Get('vacuum-pads')
  listVacuumPads() {
    return this.masterDataService.listVacuumPads();
  }

  @Post('vacuum-pads')
  createVacuumPad(@Body() dto: CreateVacuumPadDto) {
    return this.masterDataService.createVacuumPad(dto);
  }

  @Patch('vacuum-pads/:id')
  updateVacuumPad(@Param('id') id: string, @Body() dto: UpdateVacuumPadDto) {
    return this.masterDataService.updateVacuumPad(id, dto);
  }

  @Delete('vacuum-pads/:id')
  deleteVacuumPad(@Param('id') id: string) {
    return this.masterDataService.deleteVacuumPad(id);
  }

  @Get('vacuum-pads/:id')
  async getVacuumPadDetail(@Param('id') id: string) {
    const result = await this.masterDataService.getVacuumPadDetail(id);

    if (!result.ok) {
      throw new HttpException(result, 404);
    }

    return result;
  }

  @Post('import/:entity/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5_000_000 } }))
  previewImport(
    @Param('entity') entity: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.importWorkbook(entity, file, true);
  }

  @Post('import/:entity/commit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5_000_000 } }))
  commitImport(
    @Param('entity') entity: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.importWorkbook(entity, file, false);
  }

  private importWorkbook(
    entityParam: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ) {
    const entity = parseImportEntity(entityParam);
    validateUploadedWorkbook(file);

    return this.masterDataImportService.importEntityFromWorkbookBuffer({
      entity,
      fileName: file.originalname,
      buffer: file.buffer,
      dryRun,
    });
  }
}

function parseImportEntity(value: string): EntityName {
  switch (value) {
    case 'vacuum-pads':
    case 'vacuums':
    case 'VacuumPads':
      return 'VacuumPads';
    case 'machines':
    case 'Machines':
      return 'Machines';
    case 'rack-locations':
    case 'racks':
    case 'RackLocations':
      return 'RackLocations';
    case 'fault-catalog':
    case 'faults':
    case 'FaultCatalog':
      return 'FaultCatalog';
    default:
      throw new BadRequestException('Unsupported master-data import entity');
  }
}

function validateUploadedWorkbook(
  file?: Express.Multer.File,
): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('Workbook file is required');
  }

  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Only .xlsx workbooks are supported');
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new BadRequestException('Uploaded workbook is empty');
  }
}
