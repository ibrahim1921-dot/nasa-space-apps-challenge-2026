import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusChip from '@/components/StatusChip';
import { AppProvider } from '@/components/AppProvider';
import BodyMap from '@/features/bodymap/BodyMap';
import { validReading } from '@/features/checkin/Checkin';
it('pairs every status with text and an icon', () => {
  const { container } = render(<>{['normal','watch','alert','no_data'].map(status => <StatusChip key={status} status={status}/>)}</>);
  for (const text of ['OK','Watch','Alert','No data']) expect(screen.getByText(text)).toBeTruthy(); expect(container.querySelectorAll('[aria-hidden=true]')).toHaveLength(4);
});
it('opens a region with Enter and exposes a labelled modal with a close control', () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  render(<AppProvider><BodyMap summary={{ indicators: [], bodyRegions: [{ id: 'head', status: 'watch' }] }}/></AppProvider>);
  const head = screen.getByRole('button', { name: 'Head: Watch. Open details' }); expect(head.getAttribute('tabindex')).toBe('0'); fireEvent.keyDown(head,{key:'Enter'});
  expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('body-region-title'); fireEvent.click(screen.getByRole('button',{name:'Close body region details'})); expect(screen.queryByRole('dialog')).toBeNull();
});
it('checks typing errors without evaluating medical status', () => {
  expect(validReading('heart_rate','')).toBe(false); expect(validReading('heart_rate','abc')).toBe(false); expect(validReading('heart_rate','80')).toBe(true); expect(validReading('blood_pressure',{systolic:'118',diastolic:''})).toBe(false); expect(validReading('mood',2.5)).toBe(false);
});
