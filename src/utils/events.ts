type Handler<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: Handler<Events[K]>): void {
    this.map.get(event)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.map.get(event)?.forEach((fn) => (fn as Handler<Events[K]>)(payload));
  }

  clear(): void {
    this.map.clear();
  }
}
