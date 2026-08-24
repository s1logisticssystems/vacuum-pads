import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { AdminSseEvent, AdminWorkflowEvent } from './admin-events.types';

const ADMIN_EVENTS_RETRY_MS = 10000;
const ADMIN_EVENTS_PING_MS = 25000;

@Injectable()
export class AdminEventsService {
  private readonly logger = new Logger(AdminEventsService.name);
  private readonly events$ = new Subject<AdminWorkflowEvent>();

  stream(): Observable<MessageEvent> {
    const workflowEvents$ = this.events$.pipe(
      map((event) => this.toMessageEvent(event)),
    );
    const keepAlive$ = interval(ADMIN_EVENTS_PING_MS).pipe(
      map(() =>
        this.toMessageEvent({
          type: 'ping',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    return merge(workflowEvents$, keepAlive$);
  }

  emitWorkflowEvent(
    event: Omit<AdminWorkflowEvent, 'timestamp'> & { timestamp?: string },
  ) {
    try {
      const payload: AdminWorkflowEvent = {
        ...event,
        timestamp: event.timestamp ?? new Date().toISOString(),
      };

      this.events$.next(payload);
    } catch (error) {
      this.logger.warn(
        `Admin SSE event emit failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private toMessageEvent(event: AdminSseEvent): MessageEvent {
    return {
      data: event,
      retry: ADMIN_EVENTS_RETRY_MS,
    };
  }
}
