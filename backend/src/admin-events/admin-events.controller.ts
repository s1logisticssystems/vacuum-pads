import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AdminEventsService } from './admin-events.service';

@Controller('events')
export class AdminEventsController {
  constructor(private readonly adminEventsService: AdminEventsService) {}

  @Sse('admin')
  adminEvents(): Observable<MessageEvent> {
    return this.adminEventsService.stream();
  }
}
