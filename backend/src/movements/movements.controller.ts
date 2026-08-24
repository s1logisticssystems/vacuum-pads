import { Controller, Get, Query } from '@nestjs/common';
import { MovementsService } from './movements.service';
import type { ListMovementsQuery } from './movements.types';

@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  listMovements(@Query() query: ListMovementsQuery) {
    return this.movementsService.listMovements(query);
  }
}
