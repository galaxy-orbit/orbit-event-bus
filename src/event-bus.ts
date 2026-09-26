import 'reflect-metadata';
import type { OnModuleDestroy } from '@galaxy-stack/orbit-core';

export interface EventHandlerMeta {
  event: string;
  propertyKey: string | symbol;
  priority: number;
  once: boolean;
}

export type EventHandler = (payload: any, event: string) => any | Promise<any>;

const HANDLERS = new Map<Function, EventHandlerMeta[]>();
const ON_EVENT_META = 'orbit:on-event';

export function OnEvent(event: string, options: { priority?: number; once?: boolean } = {}): MethodDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const list = HANDLERS.get(target.constructor) ?? [];
    list.push({ event, propertyKey, priority: options.priority ?? 0, once: options.once ?? false });
    HANDLERS.set(target.constructor, list);
    Reflect.defineMetadata(ON_EVENT_META, list, target.constructor);
  };
}

export function getEventHandlerMeta(cls: Function): EventHandlerMeta[] {
  return Reflect.getMetadata(ON_EVENT_META, cls) ?? HANDLERS.get(cls) ?? [];
}

export interface EventEnvelope<T = any> {
  event: string;
  payload: T;
  timestamp: number;
}

export interface EventBusOptions {
  /** Treat '.'-separated patterns with * wildcards. Default: true */
  wildcards?: boolean;
  /** Re-throw handler errors to the caller of emit. Default: false (log & continue) */
  throwErrors?: boolean;
  /** Called for every handler error when throwErrors is false */
  onError?: (error: unknown, event: string, handlerName: string) => void;
}

interface Registration {
  handler: EventHandler;
  instance: any;
  meta: EventHandlerMeta;
}

export class EventBus {
  private registrations = new Map<string, Registration[]>();
  private fragmentIndex = new Map<string, Registration[]>();
  private wildcard: boolean;
  private throwErrors: boolean;
  private onError?: EventBusOptions['onError'];

  constructor(options: EventBusOptions = {}) {
    this.wildcard = options.wildcards ?? true;
    this.throwErrors = options.throwErrors ?? false;
    this.onError = options.onError;
  }

  private registeredInstances = new Set<any>();

  register(instance: any): void {
    if (this.registeredInstances.has(instance)) return;
    this.registeredInstances.add(instance);
    const cls = instance.constructor;
    const metas = getEventHandlerMeta(cls);
    for (const meta of metas) {
      const handler: EventHandler = (payload, event) => instance[meta.propertyKey](payload, event);
      const registration: Registration = { handler, instance, meta };
      const list = this.registrations.get(meta.event) ?? [];
      list.push(registration);
      list.sort((a, b) => b.meta.priority - a.meta.priority);
      this.registrations.set(meta.event, list);

      if (this.wildcard && meta.event.includes('*')) {
        const fragments = meta.event.split('.');
        for (let i = 1; i <= fragments.length; i++) {
          const prefix = fragments.slice(0, i).join('.');
          const fl = this.fragmentIndex.get(prefix) ?? [];
          if (!fl.includes(registration)) fl.push(registration);
          this.fragmentIndex.set(prefix, fl);
        }
      }
    }
  }

  private matches(pattern: string, event: string): boolean {
    if (pattern === event) return true;
    if (!this.wildcard || !pattern.includes('*')) return false;
    const regex = this.patternCache.get(pattern);
    if (regex) return regex.test(event);
    const compiled = this.compile(pattern);
    this.patternCache.set(pattern, compiled);
    return compiled.test(event);
  }

  private patternCache = new Map<string, RegExp>();

  private compile(pattern: string): RegExp {
    const parts = pattern.split('.');
    const compiled = parts
      .map((p) => {
        if (p === '**') return '(?:.+\\..+|[^.]+|)';
        if (p === '*') return '[^.]+';
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('\\.');
    return new RegExp(`^${compiled}$`);
  }

  emit<T = any>(event: string, payload?: T): boolean {
    let called = false;
    for (const registration of this.collect(event)) {
      called = true;
      try {
        registration.handler(payload, event);
        if (registration.meta.once) this.removeHandler(registration);
      } catch (error) {
        if (this.throwErrors) throw error;
        this.onError?.(error, event, `${registration.instance.constructor.name}.${String(registration.meta.propertyKey)}`);
      }
    }
    return called;
  }

  async emitAsync<T = any>(event: string, payload?: T): Promise<boolean> {
    const registrations = this.collect(event);
    if (registrations.length === 0) return false;

    const tasks = registrations.map(async (registration) => {
      try {
        await registration.handler(payload, event);
        if (registration.meta.once) this.removeHandler(registration);
      } catch (error) {
        if (this.throwErrors) throw error;
        this.onError?.(error, event, `${registration.instance.constructor.name}.${String(registration.meta.propertyKey)}`);
      }
    });
    await Promise.allSettled(tasks);
    return true;
  }

  private collect(event: string): Registration[] {
    const seen = new Set<Registration>();
    const result: Registration[] = [];

    const addAll = (list: Registration[] | undefined) => {
      if (!list) return;
      for (const r of list) {
        if (seen.has(r)) continue;
        if (this.matches(r.meta.event, event)) {
          seen.add(r);
          result.push(r);
        }
      }
    };

    addAll(this.registrations.get(event));
    if (this.wildcard) {
      const parts = event.split('.');
      for (let i = parts.length; i >= 1; i--) {
        addAll(this.fragmentIndex.get(parts.slice(0, i).join('.')));
      }
    }
    return result;
  }

  private removeHandler(registration: Registration): void {
    const list = this.registrations.get(registration.meta.event);
    if (!list) return;
    const idx = list.indexOf(registration);
    if (idx !== -1) list.splice(idx, 1);
  }

  listenerCount(event: string): number {
    return this.collect(event).length;
  }

  reset(): void {
    this.registrations.clear();
    this.fragmentIndex.clear();
  }

  /** Wiring data for devtools: event -> registered handler class/property names. */
  wiring(): Array<{ event: string; handlers: Array<{ handler: string }> }> {
    const result: Array<{ event: string; handlers: Array<{ handler: string }> }> = [];
    for (const [event, list] of this.registrations) {
      result.push({
        event,
        handlers: list.map((r) => ({
          handler: `${r.instance.constructor.name}.${String(r.meta.propertyKey)}`,
        })),
      });
    }
    return result;
  }

}
