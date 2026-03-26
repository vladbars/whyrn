import type { RenderEvent } from '../types';

type Listener = (event: RenderEvent) => void;

class OverlayManagerImpl {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: RenderEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const overlayManager = new OverlayManagerImpl();
