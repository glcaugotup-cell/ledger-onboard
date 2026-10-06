import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import BackButton from './BackButton.jsx';
import { resetNavigationHistory, skipCurrentEntry, useTrackNavigation } from '../routes/navigationHistory.js';

function Tracker() {
  useTrackNavigation();
  return null;
}

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function FormPage() {
  return (
    <>
      <h1>New property form</h1>
      <button type="button" onClick={skipCurrentEntry}>Submitted</button>
      <Link to="/landlord/properties/p9">View listing</Link>
    </>
  );
}

function renderApp(initial, backProps = {}) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Tracker />
      <Where />
      <Routes>
        <Route path="/tenant/discover" element={<Link to="/tenant/properties/p1">View details</Link>} />
        <Route path="/tenant/reservations" element={<Link to="/tenant/properties/p1">View property</Link>} />
        <Route path="/tenant/properties/:id" element={<BackButton fallback="/tenant/discover" {...backProps} />} />
        <Route path="/login" element={<Link to="/tenant/properties/p1">Open</Link>} />
        <Route path="/landlord/properties" element={<Link to="/landlord/properties/new">Add</Link>} />
        <Route path="/landlord/properties/new" element={<FormPage />} />
        <Route path="/landlord/properties/:id" element={<BackButton fallback="/landlord/properties" />} />
      </Routes>
    </MemoryRouter>
  );
}

const where = () => screen.getByTestId('where').textContent;

describe('BackButton', () => {
  beforeEach(() => resetNavigationHistory());

  it('returns to the exact in-app page the user came from', async () => {
    const user = userEvent.setup();
    renderApp('/tenant/reservations');
    await user.click(screen.getByRole('link', { name: 'View property' }));
    expect(where()).toBe('/tenant/properties/p1');
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(where()).toBe('/tenant/reservations');
  });

  it('goes to the fallback when there is no previous in-app page (pasted link, new tab, refresh)', async () => {
    const user = userEvent.setup();
    renderApp('/tenant/properties/p1');
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(where()).toBe('/tenant/discover');
  });

  it('never goes back to a sign-in screen or another area of the app', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(screen.getByRole('link', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(where()).toBe('/tenant/discover');
  });

  it('skips a form that was already submitted', async () => {
    const user = userEvent.setup();
    renderApp('/landlord/properties');
    await user.click(screen.getByRole('link', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Submitted' }));
    await user.click(screen.getByRole('link', { name: 'View listing' }));
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(where()).toBe('/landlord/properties');
  });

  it('with useHistory=false always goes to its parent page', async () => {
    const user = userEvent.setup();
    renderApp('/tenant/reservations', { useHistory: false, label: 'Back to Discover' });
    await user.click(screen.getByRole('link', { name: 'View property' }));
    await user.click(screen.getByRole('button', { name: 'Back to Discover' }));
    expect(where()).toBe('/tenant/discover');
  });

  it('can be disabled while something is uploading, and is a labelled keyboard-reachable button', async () => {
    const user = userEvent.setup();
    renderApp('/tenant/properties/p1', { disabled: true });
    const button = screen.getByRole('button', { name: 'Go back' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('focus-visible:ring-2');
    await user.click(button);
    expect(where()).toBe('/tenant/properties/p1');
  });
});
