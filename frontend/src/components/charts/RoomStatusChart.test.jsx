import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RoomStatusChart from './RoomStatusChart.jsx';

describe('RoomStatusChart', () => {
  it('shows a placeholder message when every count is zero', () => {
    render(<RoomStatusChart breakdown={{ available: 0, occupied: 0, maintenance: 0 }} />);
    expect(screen.getByText('No rooms yet.')).toBeInTheDocument();
  });

  it('renders a chart container when at least one count is non-zero', () => {
    const { container } = render(<RoomStatusChart breakdown={{ available: 3, occupied: 5, maintenance: 0 }} />);
    expect(screen.queryByText('No rooms yet.')).not.toBeInTheDocument();
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
