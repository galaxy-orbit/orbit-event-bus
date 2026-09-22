import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { EventBus, OnEvent, getEventHandlerMeta } from './event-bus';

class UserHandlers {
  created: string[] = [];
  profileUpdates: string[] = [];
  all: string[] = [];
  oncePayload: any = null;
  callCount = 0;

  @OnEvent('user.created')
  onCreated(payload: any) {
    this.created.push(payload.name);
  }

  @OnEvent('user.*')
  onAnyUser(payload: any, event: string) {
    this.profileUpdates.push(event);
  }

  @OnEvent('user.**')
  onAllUser(payload: any, event: string) {
    this.all.push(event);
  }

  @OnEvent('once.event', { once: true })
  onceHandler(payload: any) {
    this.oncePayload = payload;
    this.callCount++;
  }

  @OnEvent('boom', { priority: 10 })
  throwsFirst() {
    throw new Error('first handler fails');
  }

  @OnEvent('boom', { priority: 0 })
  stillRuns() {
    this.created.push('ran');
  }
}

describe('EventBus', () => {
  test('exact event matching', () => {
    const bus = new EventBus();
    const h = new UserHandlers();
    bus.register(h);
    bus.emit('user.created', { name: 'orbit' });
    expect(h.created).toEqual(['orbit']);
  });

  test('single-star wildcard matches one segment only', () => {
    const bus = new EventBus();
    const h = new UserHandlers();
    bus.register(h);
    bus.emit('user.updated', { name: 'x' });
    expect(h.profileUpdates).toEqual(['user.updated']);
    const deepCount = bus.listenerCount('user.profile.updated');
    expect(deepCount).toBe(1); // only ** handler
    bus.emit('user.profile.updated', { name: 'y' });
    expect(h.all).toContain('user.profile.updated');
    expect(h.profileUpdates).toEqual(['user.updated']); // user.* must not match 3 segments
  });

  test('double-star matches any depth', () => {
    const bus = new EventBus();
    const h = new UserHandlers();
    bus.register(h);
    bus.emit('user.profile.avatar.changed', {});
    expect(h.all).toContain('user.profile.avatar.changed');
    expect(h.profileUpdates).toEqual([]); // user.* must NOT match 3 segments
  });

  test('priority ordering', async () => {
    const bus = new EventBus();
    const order: string[] = [];
    class High { @OnEvent('p', { priority: 100 }) run() { order.push('high'); } }
    class Low { @OnEvent('p', { priority: -1 }) run() { order.push('low'); } }
    bus.register(new High());
    bus.register(new Low());
    await bus.emitAsync('p');
    expect(order).toEqual(['high', 'low']);
  });

  test('emitAsync runs all handlers concurrently', async () => {
    const bus = new EventBus();
    const done: string[] = [];
    class A { @OnEvent('a') async run() { await new Promise(r => setTimeout(r, 30)); done.push('slow'); } }
    class B { @OnEvent('a') run() { done.push('fast'); } }
    bus.register(new A());
    bus.register(new B());
    await bus.emitAsync('a');
    // concurrency: both completed before emitAsync resolves; fast finished while slow still pending
    expect(done).toContain('slow');
    expect(done).toContain('fast');
  });

  test('once handler runs a single time', () => {
    const bus = new EventBus();
    const h = new UserHandlers();
    bus.register(h);
    bus.emit('once.event', { n: 1 });
    bus.emit('once.event', { n: 2 });
    expect(h.callCount).toBe(1);
    expect(h.oncePayload).toEqual({ n: 1 });
  });

  test('handler errors do not stop other handlers by default', () => {
    const errors: any[] = [];
    const bus = new EventBus({ onError: (e) => errors.push(e) });
    const h = new UserHandlers();
    bus.register(h);
    const called = bus.emit('boom', {});
    expect(called).toBe(true);
    expect(errors.length).toBe(1);
    expect(h.created).toEqual(['ran']);
  });

  test('throwErrors propagates', () => {
    const bus = new EventBus({ throwErrors: true });
    bus.register(new UserHandlers());
    expect(() => bus.emit('boom', {})).toThrow('first handler fails');
  });

  test('emit returns false when no handlers', () => {
    const bus = new EventBus();
    expect(bus.emit('nobody.listens', {})).toBe(false);
  });

  test('registering duplicate instances does not duplicate handlers', () => {
    const bus = new EventBus();
    const h = new UserHandlers();
    bus.register(h);
    bus.register(h);
    bus.emit('user.created', { name: 'once-only' });
    // 3 listeners matched (exact + user.* + user.**) but the exact handler ran once
    expect(h.created).toEqual(['once-only']);
    expect(bus.listenerCount('user.created')).toBe(3);
  });
});
