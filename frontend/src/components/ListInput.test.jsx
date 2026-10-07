import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ListInput from './ListInput.jsx';
import { listItemKey } from '../utils/listItems.js';
import { AMENITY_SUGGESTIONS, HOUSE_RULE_SUGGESTIONS } from '../data/propertyListSuggestions.js';
import { toSentenceCase } from '../utils/textFormat.js';

/** Holds the list in state like the property form does, and reports every change. */
function Harness({ initial = [], onChangeSpy = () => {}, ...props }) {
  const [values, setValues] = useState(initial);
  return (
    <ListInput
      values={values}
      onChange={(next) => {
        onChangeSpy(next);
        setValues(next);
      }}
      {...props}
    />
  );
}

const amenities = (props) => <Harness label="Amenities" suggestions={AMENITY_SUGGESTIONS} placeholder="e.g., WiFi" itemName="amenity" itemNamePlural="amenities" {...props} />;
const rules = (props) => (
  <Harness variant="list" label="House rules" suggestions={HOUSE_RULE_SUGGESTIONS} placeholder="e.g., No visitors after 10 PM" format={toSentenceCase} itemName="rule" itemNamePlural="rules" {...props} />
);
const pill = (name) => within(screen.getByRole('group', { name: /^Suggested/ })).getByRole('button', { name });
const counter = (text) => screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent.startsWith(text) && el.className.includes('tabular-nums'));

describe('listItemKey', () => {
  it('treats Wi-Fi, wifi, WiFi and "wi fi" as the same entry', () => {
    expect(new Set(['Wi-Fi', 'wifi', 'WiFi', ' wi fi ', 'WI.FI']).size).toBe(5);
    expect(new Set(['Wi-Fi', 'wifi', 'WiFi', ' wi fi ', 'WI.FI'].map(listItemKey)).size).toBe(1);
  });
});

describe('ListInput: chips (Amenities)', () => {
  it('adds a common choice when its pill is clicked, marks it added, and removes it on a second click', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(amenities({ onChangeSpy: spy }));
    const wifi = pill('Wi-Fi');
    expect(wifi).toHaveAttribute('aria-pressed', 'false');

    await user.click(wifi);
    expect(spy).toHaveBeenLastCalledWith(['Wi-Fi']);
    expect(pill('Wi-Fi')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Remove Wi-Fi' })).toBeInTheDocument();
    expect(counter('1 / 30')).toBeInTheDocument();

    await user.click(pill('Wi-Fi'));
    expect(spy).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('button', { name: 'Remove Wi-Fi' })).not.toBeInTheDocument();
  });

  it('suggestions work from the keyboard (Enter and Space)', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(amenities({ onChangeSpy: spy }));
    pill('CCTV').focus();
    await user.keyboard('{Enter}');
    expect(spy).toHaveBeenLastCalledWith(['CCTV']);
    pill('Parking').focus();
    await user.keyboard(' ');
    expect(spy).toHaveBeenLastCalledWith(['CCTV', 'Parking']);
  });

  it('adds typed entries with Enter or a comma, keeping the case the landlord typed', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(amenities({ onChangeSpy: spy }));
    await user.type(screen.getByLabelText(/^Amenities/), 'Rooftop deck{enter}Gym,');
    expect(spy).toHaveBeenLastCalledWith(['Rooftop deck', 'Gym']);
    expect(screen.getByLabelText(/^Amenities/)).toHaveValue('');
  });

  it('removes with the × button or Backspace in the empty box', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(amenities({ initial: ['Wi-Fi', 'CCTV', 'Parking'], onChangeSpy: spy }));
    await user.click(screen.getByRole('button', { name: 'Remove CCTV' }));
    expect(spy).toHaveBeenLastCalledWith(['Wi-Fi', 'Parking']);
    await user.click(screen.getByLabelText(/^Amenities/));
    await user.keyboard('{Backspace}');
    expect(spy).toHaveBeenLastCalledWith(['Wi-Fi']);
  });

  it('refuses duplicates written differently and says so', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(amenities({ initial: ['Wi-Fi'], onChangeSpy: spy }));
    await user.type(screen.getByLabelText(/^Amenities/), 'wifi{enter}');
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('“Wi-Fi” is already in the list.');
    await user.type(screen.getByLabelText(/^Amenities/), 'WI FI{enter}');
    expect(spy).not.toHaveBeenCalled();
    // A typed spelling also counts as the suggestion being added.
    expect(pill('Wi-Fi')).toHaveAttribute('aria-pressed', 'true');
  });

  it('splits pasted text on new lines and commas, and reports skipped duplicates', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(amenities({ initial: ['CCTV'], onChangeSpy: spy }));
    await user.click(screen.getByLabelText(/^Amenities/));
    await user.paste('Wi-Fi, Parking\ncctv\nRooftop');
    expect(spy).toHaveBeenLastCalledWith(['CCTV', 'Wi-Fi', 'Parking', 'Rooftop']);
    expect(screen.getByRole('status')).toHaveTextContent('“CCTV” is already in the list.');
  });

  it('refuses entries over 200 characters, keeping the text so it can be shortened', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(amenities({ onChangeSpy: spy }));
    const input = screen.getByLabelText(/^Amenities/);
    await user.click(input);
    await user.paste('x'.repeat(201));
    expect(screen.getByRole('status')).toHaveTextContent('That amenity has 201 characters; the limit is 200.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.keyboard('{Enter}');
    expect(spy).not.toHaveBeenCalled();
    expect(input).toHaveValue('x'.repeat(201));
    expect(screen.getByRole('status')).toHaveTextContent('Keep each amenity to 200 characters or fewer (that one has 201).');
  });

  it('at 30 entries it refuses more, disables the unused suggestions and explains why', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    const thirty = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`);
    render(amenities({ initial: thirty, onChangeSpy: spy }));
    expect(counter('30 / 30')).toBeInTheDocument();
    expect(screen.getByText('Limit of 30 reached. Remove an item to add more.')).toBeInTheDocument();
    expect(pill('Wi-Fi')).toBeDisabled();
    await user.type(screen.getByLabelText(/^Amenities/), 'One more{enter}');
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('You can add up to 30 amenities. Remove one to add another.');
  });

  it("loads a saved property's values exactly as stored", () => {
    render(amenities({ initial: ['wifi', 'Aircon', 'CCTV'] }));
    expect(screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Remove wifi', 'Remove Aircon', 'Remove CCTV']);
    expect(pill('Wi-Fi')).toHaveAttribute('aria-pressed', 'true');
    expect(counter('3 / 30')).toBeInTheDocument();
  });
});

describe('ListInput: list (House rules)', () => {
  it('shows rules as a numbered list; a comma does not split a rule; Enter adds it sentence-cased', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(rules({ onChangeSpy: spy }));
    await user.type(screen.getByLabelText(/^House rules/), 'quiet hours, please, after 9 PM{enter}');
    expect(spy).toHaveBeenLastCalledWith(['Quiet hours, please, after 9 PM']);
    const list = screen.getByRole('list', { name: 'Added rules' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('1.Quiet hours, please, after 9 PM');
  });

  it('adds a common rule from its pill and removes a rule from its row', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(rules({ onChangeSpy: spy }));
    await user.click(pill('No smoking'));
    await user.click(pill('No pets'));
    expect(spy).toHaveBeenLastCalledWith(['No smoking', 'No pets']);
    await user.click(screen.getByRole('button', { name: 'Remove No smoking' }));
    expect(spy).toHaveBeenLastCalledWith(['No pets']);
  });

  it('splits a paste on new lines only (commas stay inside a rule)', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(rules({ onChangeSpy: spy }));
    await user.click(screen.getByLabelText(/^House rules/));
    await user.paste('no smoking, no vaping\r\nno pets\n\n');
    expect(spy).toHaveBeenLastCalledWith(['No smoking, no vaping', 'No pets']);
  });

  it('reorders rules with Move up / Move down', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(rules({ initial: ['No smoking', 'No pets', 'No alcohol'], onChangeSpy: spy }));
    expect(screen.getByRole('button', { name: 'Move “No smoking” up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move “No alcohol” down' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move “No alcohol” up' }));
    expect(spy).toHaveBeenLastCalledWith(['No smoking', 'No alcohol', 'No pets']);
  });

  it('refuses a duplicate rule written differently', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(rules({ initial: ['No visitors after 10 PM'], onChangeSpy: spy }));
    await user.type(screen.getByLabelText(/^House rules/), 'no visitors after 10pm{enter}');
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('“No visitors after 10 PM” is already in the list.');
  });
});
