import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyedSubscriptionStore } from './store';

afterEach(() => vi.useRealTimers());

describe('KeyedSubscriptionStore', () => {
  it('compartilha um único listener por chave e fecha após a carência', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    let emit: (v: number) => void = () => undefined;
    const open = vi.fn((_key: string, e: (v: number) => void) => {
      emit = e;
      return close;
    });
    const store = new KeyedSubscriptionStore<number>(open, 1000);

    const a = vi.fn();
    const b = vi.fn();
    const ua = store.subscribe('u1', a);
    const ub = store.subscribe('u1', b);
    expect(open).toHaveBeenCalledTimes(1);

    emit(42);
    expect(store.get('u1')).toBe(42);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();

    ua();
    ub();
    vi.advanceTimersByTime(500);
    // Reassinatura durante a carência reaproveita o listener.
    const uc = store.subscribe('u1', a);
    vi.advanceTimersByTime(2000);
    expect(close).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);

    uc();
    vi.advanceTimersByTime(1000);
    expect(close).toHaveBeenCalledTimes(1);
    expect(store.get('u1')).toBeUndefined();
  });
});
