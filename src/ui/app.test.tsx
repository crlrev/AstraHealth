// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from '../App';
import { gateway } from '../backend/edge';

beforeAll(() => {
  // jsdom lacks these browser APIs used by charts / motion
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => {};
});
afterEach(() => { cleanup(); window.location.hash = ''; });
afterAll(() => gateway.stop());

async function signIn(username: string) {
  render(<App />);
  const user = await screen.findByLabelText('Username', {}, { timeout: 15000 });
  fireEvent.change(user, { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'astra-demo' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /sign in/i })); });
  await screen.findByRole('heading', { name: 'Mission Overview', level: 1 }, { timeout: 15000 });
}
const nav = () => within(screen.getAllByRole('navigation', { name: 'Primary' })[0]);

describe('UI integration (jsdom)', () => {
  it('flight surgeon: every visible nav item opens its route', async () => {
    await signIn('dr.okafor');
    expect(screen.getAllByText(/NOT FOR CLINICAL USE/).length).toBeGreaterThan(0);
    const expected: [string, string][] = [
      ['Crew Monitoring', 'Crew Monitoring'], ['Anatomical Monitor', 'Anatomical Monitor'], ['Vital Signs', 'Vital Signs'],
      ['Health Analytics', 'Health Analytics'], ['Sleep & Recovery', 'Sleep & Recovery'], ['Radiation Exposure', 'Radiation Exposure'],
      ['Medical Records', 'Medical Records'], ['Reports', 'Reports'], ['Settings', 'Settings'], ['Mission Overview', 'Mission Overview'],
    ];
    for (const [link, heading] of expected) {
      await act(async () => { fireEvent.click(nav().getByRole('link', { name: link })); });
      await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 5000 });
    }
  }, 60000);

  it('anatomy regions are keyboard-selectable and unmapped regions say so', async () => {
    await signIn('dr.okafor');
    await act(async () => { fireEvent.click(nav().getByRole('link', { name: 'Anatomical Monitor' })); });
    await screen.findByRole('heading', { name: 'Anatomical Monitor', level: 1 });
    const head = screen.getByRole('button', { name: /Head \/ neurological: no mapped sensor data/ });
    await act(async () => { fireEvent.keyDown(head, { key: 'Enter' }); });
    await waitFor(() => expect(screen.getByText('No mapped sensor data')).toBeTruthy());
    const lungs = screen.getByRole('button', { name: /Lungs \/ respiratory: 2 mapped/ });
    await act(async () => { fireEvent.keyDown(lungs, { key: ' ' }); });
    await waitFor(() => expect(lungs.getAttribute('aria-pressed')).toBe('true'));
    expect((await screen.findAllByText(/Mapping basis/, {}, { timeout: 5000 })).length).toBe(2);
  }, 30000);

  it('mission control: no medical nav items, medical data hidden', async () => {
    await signIn('ops.tanaka');
    expect(nav().queryByRole('link', { name: 'Vital Signs' })).toBeNull();
    expect(nav().queryByRole('link', { name: 'Medical Records' })).toBeNull();
    expect(screen.getAllByText('Medical data hidden for your role').length).toBeGreaterThan(0);
  }, 30000);

  it('astronaut: crew list contains only self', async () => {
    await signIn('astro.vega');
    await act(async () => { fireEvent.click(nav().getByRole('link', { name: 'Crew Monitoring' })); });
    await screen.findByRole('heading', { name: 'Crew Monitoring', level: 1 });
    expect(screen.getByText('1 result(s) · page 1 of 1')).toBeTruthy();
    expect(screen.queryByText('Idris Kale')).toBeNull();
  }, 30000);

  it('alert workflow: acknowledge keeps alert open', async () => {
    await signIn('dr.okafor');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Alerts:/ })); });
    const dlg = await screen.findByRole('dialog', { name: 'Open alerts' });
    const first = within(dlg).getAllByRole('button').find((b) => /DEMO alert/.test(b.textContent ?? ''))!;
    await act(async () => { fireEvent.click(first); });
    const detail = await screen.findByRole('dialog', { name: /DEMO alert/ });
    await act(async () => { fireEvent.click(within(detail).getByRole('button', { name: 'Acknowledge' })); });
    await waitFor(() => expect(within(detail).getByText(/does not resolve/)).toBeTruthy());
    expect(within(detail).getByRole('button', { name: /Escalate/ }).hasAttribute('disabled')).toBe(true);
  }, 30000);

  it('axe-core structural checks on Mission Overview and Vital Signs (color-contrast excluded in jsdom)', async () => {
    await signIn('dr.okafor');
    const run = async () => (await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    const v1 = await run();
    await act(async () => { fireEvent.click(nav().getByRole('link', { name: 'Vital Signs' })); });
    await screen.findByRole('heading', { name: 'Vital Signs', level: 1 });
    const v2 = await run();
    const summary = [...v1, ...v2].map((v) => `${v.id}: ${v.nodes.length} node(s)`);
    console.log('AXE serious/critical:', JSON.stringify(summary));
    expect(summary).toEqual([]);
  }, 60000);
});
