import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { OrbitFactory, Module, Injectable } from '@galaxy-stack/orbit-core';
import { EventBusModule, EventBus, OnEvent } from './event-bus.module';

@Injectable()
class OrderHandlers {
  orders: string[] = [];
  @OnEvent('order.placed')
  onOrder(payload: any) { this.orders.push(payload.id); }
}

@Module({
  imports: [EventBusModule.forRoot({ handlers: [new OrderHandlers()] })],
})
class AppModule {}

describe('EventBusModule integration', () => {
  test('resolves EventBus from container and routes events to registered handlers', async () => {
    const app = await OrbitFactory.create(AppModule);
    const bus: EventBus = await app.getContainer().resolve(EventBus);
    expect(typeof bus.emit).toBe('function');
    expect(typeof bus.emitAsync).toBe('function');
    // AppModule registers a handler for order.placed — emit reaches it
    const result = await bus.emitAsync('order.placed', { id: 'o1' });
    expect(result).toBe(true);
  });

  test('forRoot registers provided handler instances', async () => {
    const handler = new OrderHandlers();
    class M2 {}
    const app = await OrbitFactory.create({
      module: M2,
      imports: [EventBusModule.forRoot({ handlers: [handler] })],
    } as any);
    const bus: EventBus = await app.getContainer().resolve(EventBus);
    await bus.emitAsync('order.placed', { id: 'o9' });
    expect(handler.orders).toEqual(['o9']);
  });
});
