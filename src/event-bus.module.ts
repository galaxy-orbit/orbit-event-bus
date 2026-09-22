import type { DynamicModule } from '@galaxy-stack/orbit-core';
import { EventBus, EventBusOptions, OnEvent, getEventHandlerMeta } from './event-bus';

export const EVENT_BUS = Symbol('EVENT_BUS');
export const EVENT_BUS_OPTIONS = Symbol('EVENT_BUS_OPTIONS');

export interface EventBusModuleOptions extends EventBusOptions {
  /** Instances with @OnEvent handlers to register eagerly. */
  handlers?: any[];
  isGlobal?: boolean;
}

export class EventBusModule {
  static forRoot(options: EventBusModuleOptions = {}): DynamicModule {
    return {
      module: EventBusModule,
      global: options.isGlobal ?? true,
      providers: [
        { provide: EVENT_BUS_OPTIONS, useValue: options },
        {
          provide: EVENT_BUS,
          useFactory: (opts: EventBusModuleOptions) => {
            const bus = new EventBus(opts);
            for (const handler of opts.handlers ?? []) bus.register(handler);
            return bus;
          },
          inject: [EVENT_BUS_OPTIONS],
        },
        { provide: EventBus, useExisting: EVENT_BUS },
      ],
      exports: [EVENT_BUS, EventBus, EVENT_BUS_OPTIONS],
    };
  }

  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<EventBusModuleOptions> | EventBusModuleOptions;
    inject?: any[];
    isGlobal?: boolean;
  }): DynamicModule {
    return {
      module: EventBusModule,
      global: options.isGlobal ?? true,
      providers: [
        {
          provide: EVENT_BUS_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: EVENT_BUS,
          useFactory: (opts: EventBusModuleOptions) => {
            const bus = new EventBus(opts);
            for (const handler of opts.handlers ?? []) bus.register(handler);
            return bus;
          },
          inject: [EVENT_BUS_OPTIONS],
        },
        { provide: EventBus, useExisting: EVENT_BUS },
      ],
      exports: [EVENT_BUS, EventBus, EVENT_BUS_OPTIONS],
    };
  }
}

export { EventBus, OnEvent, getEventHandlerMeta };
export type { EventBusOptions } from './event-bus';
