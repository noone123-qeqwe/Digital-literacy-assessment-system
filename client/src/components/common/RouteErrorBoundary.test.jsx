import React, { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RouteErrorBoundary from './RouteErrorBoundary';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

function ThrowingView({ shouldThrow }) {
  if (shouldThrow) throw new Error('Simulated render failure');
  return <div>Healthy page content</div>;
}

describe('RouteErrorBoundary', () => {
  it('catches route errors and resets automatically when resetKey changes', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <RouteErrorBoundary resetKey="/first">
        <ThrowingView shouldThrow />
      </RouteErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong loading this page/i)).toBeInTheDocument();

    rerender(
      <RouteErrorBoundary resetKey="/second">
        <ThrowingView shouldThrow={false} />
      </RouteErrorBoundary>
    );

    expect(screen.getByText('Healthy page content')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe('lazyWithRetry', () => {
  it('reloads once on a stale chunk load error and throws after the cooldown guard is set', async () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    try {
      const FailingLazy = lazyWithRetry(() => Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/old.js')));
      render(
        <Suspense fallback={<div>Loading…</div>}>
          <FailingLazy />
        </Suspense>
      );

      await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
      expect(sessionStorage.getItem('dlas:chunk-reload-at')).toBeTruthy();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const SecondLazy = lazyWithRetry(() => Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/old.js')));
      render(
        <RouteErrorBoundary resetKey="/retry">
          <Suspense fallback={<div>Loading…</div>}>
            <SecondLazy />
          </Suspense>
        </RouteErrorBoundary>
      );

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      consoleError.mockRestore();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });
});
