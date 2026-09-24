import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RevenueTrendChart from './RevenueTrendChart.jsx';

describe('RevenueTrendChart', () => {
  it('shows a placeholder message when there is no data', () => {
    render(<RevenueTrendChart data={[]} />);
    expect(screen.getByText('No revenue recorded yet.')).toBeInTheDocument();
  });

  it('shows a placeholder message when data is undefined', () => {
    render(<RevenueTrendChart />);
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
