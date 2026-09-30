import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RevenueTrendChart from './RevenueTrendChart.jsx';

describe('RevenueTrendChart', () => {
  // The empty state links to the payments page, so it needs a router.
  it('shows a placeholder message when there is no data', () => {
    render(<MemoryRouter><RevenueTrendChart data={[]} /></MemoryRouter>);
    expect(screen.getByText('No revenue recorded yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View payments' })).toHaveAttribute('href', '/landlord/payments');
  });

  it('shows a placeholder message when data is undefined', () => {
    render(<MemoryRouter><RevenueTrendChart /></MemoryRouter>);
    expect(screen.getByText('No revenue recorded yet.')).toBeInTheDocument();
  });

  it('renders a chart container instead of the placeholder when data is present', () => {
    const { container } = render(
      <RevenueTrendChart
        data={[
          { month: '2026-07', revenue: 12000 },
          { month: '2026-08', revenue: 15500 },
        ]}
      />
    );
    expect(screen.queryByText('No revenue recorded yet.')).not.toBeInTheDocument();
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
