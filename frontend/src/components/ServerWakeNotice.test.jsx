import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServerWakeNotice from './ServerWakeNotice.jsx';
import instance, { SLOW_REQUEST_MS } from '../services/apiClient.js';

const requestFulfilled = instance.interceptors.request.handlers[0].fulfilled;
const responseFulfilled = instance.interceptors.response.handlers[0].fulfilled;

describe('ServerWakeNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('appears once a request has been waiting a few seconds and hides when it finishes', () => {
    render(<ServerWakeNotice />);
    const config = requestFulfilled({ headers: {} });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SLOW_REQUEST_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/waking up the server/i);

    act(() => {
      responseFulfilled({ config });
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
