import { describe, test, expect } from 'bun:test';
import { EventBus, OnEvent } from './event-bus';

class UserHandlers {
  @OnEvent('user.created')
  onCreated(_p: any) {}
  @OnEvent('user.deleted')
  onDeleted(_p: any) {}
}

describe('EventBus.wiring()', () => {
  test('returns event -> handler wiring for devtools', () => {
    const bus = new EventBus();
    bus.register(new UserHandlers());
    const wiring = bus.wiring();
    expect(wiring.length).toBe(2);
    const created = wiring.find((w) => w.event === 'user.created');
    expect(created?.handlers).toEqual([{ handler: 'UserHandlers.onCreated' }]);
  });

  test('wiring updates after re-register (deduped)', () => {
    const bus = new EventBus();
    const h = new UserHandlers();
    bus.register(h);
    bus.register(h);
    expect(bus.wiring().length).toBe(2);
  });
});
