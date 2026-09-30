import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RoomStatusChart from './RoomStatusChart.jsx';

describe('RoomStatusChart', () => {
  it('shows a placeholder message when every count is zero', () => {
    render(<RoomStatusChart breakdown={{ available: 0, occupied: 0, maintenance: 0 }} />);
    expect(screen.getByText('No rooms yet.')).toBeInTheDocument();
  });

  it('renders a bar per status with its share of all rooms', () => {
    render(<RoomStatusChart breakdown={{ available: 3, occupied: 5, maintenance: 0 }} />);
    expect(screen.queryByText('No rooms yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Available rooms' })).toHaveAttribute('aria-valuenow', '37.5');
    expect(screen.getByRole('progressbar', { name: 'Occupied rooms' })).toHaveAttribute('aria-valuenow', '62.5');
    expect(screen.getByRole('progressbar', { name: 'Maintenance rooms' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
  });
});
