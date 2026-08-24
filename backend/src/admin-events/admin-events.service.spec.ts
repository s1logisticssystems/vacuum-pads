import { AdminEventsService } from './admin-events.service';

describe('AdminEventsService', () => {
  it('emits workflow events to active SSE subscribers', () => {
    const service = new AdminEventsService();
    const received: unknown[] = [];
    const subscription = service.stream().subscribe((message) => {
      received.push(message.data);
    });

    service.emitWorkflowEvent({
      type: 'charge',
      vacuumSerial: 'SN-VP-001',
      vacuumCode: 'VP-001',
      machineCode: 'MACH-001',
    });

    subscription.unsubscribe();

    expect(received).toEqual([
      expect.objectContaining({
        type: 'charge',
        vacuumSerial: 'SN-VP-001',
        vacuumCode: 'VP-001',
        machineCode: 'MACH-001',
      }),
    ]);
  });
});
