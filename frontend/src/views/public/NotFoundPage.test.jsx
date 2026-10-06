import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFoundPage from './NotFoundPage.jsx';

describe('NotFoundPage', () => {
  it('renders a 404 message with a link home', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/404/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });

  it('has a Back button that goes home when there is no previous page', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <Routes>
          <Route path="/" element={<p>Landing page</p>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByText('Landing page')).toBeInTheDocument();
  });
});
