import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatTile from './StatTile.jsx';

describe('StatTile', () => {
  it('renders the label, value, and sublabel', () => {
    render(<StatTile label="Occupancy rate" value="82%" sublabel="41/50 rooms occupied" />);
    expect(screen.getByText('Occupancy rate')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('41/50 rooms occupied')).toBeInTheDocument();
  });

  it('omits the sublabel when none is given', () => {
    render(<StatTile label="Properties" value={4} />);
    expect(screen.queryByText(/rooms/)).not.toBeInTheDocument();
  });

  it('applies the critical tone color class', () => {
    render(<StatTile label="Outstanding debt" value="₱5,000" tone="critical" />);
    expect(screen.getByText('₱5,000')).toHaveClass('text-[#d03b3b]');
  });

  it('applies the good tone color class', () => {
    render(<StatTile label="Outstanding debt" value="₱0" tone="good" />);
    expect(screen.getByText('₱0')).toHaveClass('text-[#0ca30c]');
  });
});
