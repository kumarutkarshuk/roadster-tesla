export function createHeldInputs(keys: Set<string>) {
  const keyboard = new Set<string>();
  const pointers = new Map<number, { key: string; type: string }>();

  function releaseKey(key: string) {
    if (!keyboard.has(key) && ![...pointers.values()].some((p) => p.key === key))
      keys.delete(key);
  }

  function releasePointer(pointerId: number) {
    const pointer = pointers.get(pointerId);
    if (!pointer) return;
    pointers.delete(pointerId);
    releaseKey(pointer.key);
  }

  return {
    pressKey(key: string) {
      keyboard.add(key);
      keys.add(key);
    },
    releaseKey(key: string) {
      keyboard.delete(key);
      releaseKey(key);
    },
    pressPointer(pointerId: number, key: string, type: string) {
      releasePointer(pointerId);
      pointers.set(pointerId, { key, type });
      keys.add(key);
    },
    releasePointer,
    releaseTouches() {
      for (const [id, pointer] of pointers) {
        if (pointer.type === "touch") releasePointer(id);
      }
    },
    clear() {
      keyboard.clear();
      pointers.clear();
      keys.clear();
    },
  };
}

export function bindInputRelease(
  input: ReturnType<typeof createHeldInputs>,
  target: Window,
) {
  const capture = { capture: true };
  const release = (event: PointerEvent) => input.releasePointer(event.pointerId);
  const move = (event: PointerEvent) => {
    // Recover if a browser reports movement after losing the release event.
    if (event.buttons === 0) release(event);
  };
  const touchEnd = (event: TouchEvent) => {
    // Some mobile interruptions deliver touchend without a matching pointerup.
    if (event.touches.length === 0) input.releaseTouches();
  };
  const clear = () => input.clear();
  target.addEventListener("pointerup", release, capture);
  target.addEventListener("pointercancel", release, capture);
  target.addEventListener("lostpointercapture", release, capture);
  target.addEventListener("pointermove", move, capture);
  target.addEventListener("touchend", touchEnd, capture);
  target.addEventListener("touchcancel", touchEnd, capture);
  target.addEventListener("blur", clear);
  target.addEventListener("pagehide", clear);
  target.addEventListener("orientationchange", clear);
  target.addEventListener("contextmenu", clear, capture);
  target.document.addEventListener("visibilitychange", clear);
  return () => {
    target.removeEventListener("pointerup", release, capture);
    target.removeEventListener("pointercancel", release, capture);
    target.removeEventListener("lostpointercapture", release, capture);
    target.removeEventListener("pointermove", move, capture);
    target.removeEventListener("touchend", touchEnd, capture);
    target.removeEventListener("touchcancel", touchEnd, capture);
    target.removeEventListener("blur", clear);
    target.removeEventListener("pagehide", clear);
    target.removeEventListener("orientationchange", clear);
    target.removeEventListener("contextmenu", clear, capture);
    target.document.removeEventListener("visibilitychange", clear);
    input.clear();
  };
}
