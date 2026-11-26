import React, { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';
import PullToRefreshIndicator from './PullToRefreshIndicator';

const touch = (target: Element, type: string, y: number, x = 100) => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: { clientX: number; clientY: number }[] };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  target.dispatchEvent(event);
  return event;
};

const Screen: React.FC<{ onRefresh: () => unknown }> = ({ onRefresh }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const pull = usePullToRefresh(ref, onRefresh);
  return (
    <div ref={ref} data-testid="scroller">
      <PullToRefreshIndicator {...pull} />
      <p data-testid="row">Fila</p>
    </div>
  );
};

afterEach(cleanup);

describe('usePullToRefresh', () => {
  it('reloads after a long pull from the top and shows the spinner meanwhile', async () => {
    let finish: () => void = () => undefined;
    const onRefresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<Screen onRefresh={onRefresh} />);
    const row = screen.getByTestId('row');

    act(() => {
      touch(row, 'touchstart', 100);
      touch(row, 'touchmove', 120);
    });
    let move!: Event;
    act(() => {
      move = touch(row, 'touchmove', 420);
    });
    expect(move.defaultPrevented).toBe(true);
    expect(screen.getByRole('status', { name: 'Suelta para actualizar' })).toBeTruthy();

    await act(async () => {
      touch(row, 'touchend', 0);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'Actualizando' })).toBeTruthy();

    await act(async () => {
      finish();
      await new Promise(resolve => setTimeout(resolve, 500));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does nothing when the list is scrolled', () => {
    const onRefresh = vi.fn();
    render(<Screen onRefresh={onRefresh} />);
    const scroller = screen.getByTestId('scroller');
    Object.defineProperty(scroller, 'scrollTop', { value: 200, configurable: true });
    act(() => {
      touch(scroller, 'touchstart', 100);
      touch(scroller, 'touchmove', 120);
      touch(scroller, 'touchmove', 420);
      touch(scroller, 'touchend', 0);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
