// Minimal structural view of React's internal Fiber. These fields and tag
// numbers are the ones React DevTools relies on and are stable in React 18 and 19.

export interface ContextDependency {
  context: { displayName?: string } | null;
  memoizedValue: unknown;
  next: ContextDependency | null;
}

export interface HookState {
  memoizedState: unknown;
  queue: Record<string, unknown> | null;
  next: HookState | null;
}

export interface Fiber {
  tag: number;
  type: any;
  elementType: any;
  stateNode: any;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;
  memoizedProps: Record<string, unknown> | null;
  memoizedState: any;
  dependencies: { firstContext: ContextDependency | null } | null;
  flags: number;
}

export interface FiberRoot {
  current: Fiber;
}

export const FunctionComponent = 0;
export const ClassComponent = 1;
export const HostPortal = 4;
export const HostComponent = 5;
export const ForwardRef = 11;
export const MemoComponent = 14;
export const SimpleMemoComponent = 15;

const PerformedWork = 1;

export function isCompositeFiber(fiber: Fiber): boolean {
  return (
    fiber.tag === FunctionComponent ||
    fiber.tag === ClassComponent ||
    fiber.tag === ForwardRef ||
    fiber.tag === SimpleMemoComponent
  );
}

/** True when the fiber actually executed its render in the commit being inspected. */
export function didFiberRender(fiber: Fiber): boolean {
  return (fiber.flags & PerformedWork) === PerformedWork;
}

export function getFiberName(fiber: Fiber): string {
  const type = fiber.type;
  if (!type) return 'Anonymous';
  if (fiber.tag === ForwardRef) {
    return type.displayName || type.render?.displayName || type.render?.name || 'Anonymous';
  }
  return (
    fiber.elementType?.displayName ||
    type.displayName ||
    type.name ||
    'Anonymous'
  );
}

/** Top-level host (native view) fibers rendered by a composite fiber. */
export function findHostFibers(fiber: Fiber, limit = 8): Fiber[] {
  const out: Fiber[] = [];
  let node = fiber.child;

  while (node && out.length < limit) {
    if (node.tag === HostComponent) {
      out.push(node);
    } else if (node.child && node.tag !== HostPortal) {
      node = node.child;
      continue;
    }

    while (!node.sibling) {
      node = node.return;
      if (!node || node === fiber || node === fiber.alternate) return out;
    }
    node = node.sibling;
  }

  return out;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;

declare const nativeFabricUIManager:
  | { measureInWindow?: (node: unknown, cb: MeasureCallback) => void }
  | undefined;

/** Measure a host instance in window coordinates. Handles Fabric, Paper and react-native-web. */
function measureHostInstance(stateNode: any, cb: MeasureCallback): boolean {
  if (!stateNode) return false;

  // Fabric: public instance is created lazily, so it may not exist yet.
  const publicInstance = stateNode.canonical?.publicInstance;
  if (publicInstance && typeof publicInstance.measureInWindow === 'function') {
    publicInstance.measureInWindow(cb);
    return true;
  }

  if (
    stateNode.node &&
    typeof nativeFabricUIManager !== 'undefined' &&
    typeof nativeFabricUIManager?.measureInWindow === 'function'
  ) {
    nativeFabricUIManager.measureInWindow(stateNode.node, cb);
    return true;
  }

  // Paper
  if (typeof stateNode.measureInWindow === 'function') {
    stateNode.measureInWindow(cb);
    return true;
  }

  // react-native-web (react-dom host node)
  if (typeof stateNode.getBoundingClientRect === 'function') {
    const r = stateNode.getBoundingClientRect();
    cb(r.left, r.top, r.width, r.height);
    return true;
  }

  return false;
}

/** Bounding box of all given host instances, or undefined if none could be measured. */
export function measureHostInstances(
  stateNodes: unknown[],
  done: (rect: Rect | undefined) => void
): void {
  let pending = 0;
  let rect: Rect | undefined;

  const finish = () => {
    if (--pending === 0) done(rect);
  };

  const onMeasure: MeasureCallback = (x, y, width, height) => {
    if (width > 0 && height > 0) {
      if (!rect) {
        rect = { x, y, width, height };
      } else {
        const right = Math.max(rect.x + rect.width, x + width);
        const bottom = Math.max(rect.y + rect.height, y + height);
        rect.x = Math.min(rect.x, x);
        rect.y = Math.min(rect.y, y);
        rect.width = right - rect.x;
        rect.height = bottom - rect.y;
      }
    }
    finish();
  };

  pending++;
  for (const node of stateNodes) {
    pending++;
    try {
      if (!measureHostInstance(node, onMeasure)) pending--;
    } catch {
      pending--;
    }
  }
  finish();
}
