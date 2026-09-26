<div align="center">

# @galaxy-stack/orbit-event-bus

**In-process event bus for Orbit** — `@OnEvent` decorators, wildcard patterns, priorities, sync/async emission.

[![npm version](https://img.shields.io/npm/v/@galaxy-stack/orbit-event-bus.svg)](https://www.npmjs.com/package/@galaxy-stack/orbit-event-bus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Part of the [Orbit framework](https://github.com/galaxy-orbit/orbit) — a NestJS-style backend framework for [Bun](https://bun.sh).

## Installation

```bash
bun add @galaxy-stack/orbit-event-bus
```

## Usage

```ts
import { EventBusModule, EventBus, OnEvent, Injectable, Module } from '@galaxy-stack/orbit-event-bus';

@Injectable()
export class UserHandlers {
  @OnEvent('user.created')
  onCreated(payload: { id: string }) { /* ... */ }

  @OnEvent('order.**')   // any depth under order.*
  async onOrderEvent(payload: any, event: string) { /* ... */ }
}

@Module({
  imports: [EventBusModule.forRoot({ handlers: [new UserHandlers()] })],
})
export class AppModule {}

// anywhere with DI:
constructor(private bus: EventBus) {}
await this.bus.emitAsync('user.created', { id: 'u1' });
```

Features: exact + wildcard matching (`user.*` one segment, `user.**` any depth), priority ordering, `once` handlers, error isolation (or `throwErrors: true`).

## License

MIT
