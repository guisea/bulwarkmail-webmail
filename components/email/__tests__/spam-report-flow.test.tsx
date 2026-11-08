import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email } from '@/lib/jmap/types';
import { DEFAULT_POLICY } from '@/lib/admin/types';
import { DEFAULT_ORGANISATION_POLICY } from '@/lib/admin/organisation-policy';
import { usePolicyStore } from '@/stores/policy-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useToastStore } from '@/stores/toast-store';
import { useSpamReportStore } from '@/stores/spam-report-store';

// "Mark as spam" while the admin set organisation.spamReport: it asks
// (unless the user said not to), sends one report per message to the
// gateway's address, deletes each that went out, and leaves the rest.

const email = (id: string, subject: string, mailboxIds: Record<string, boolean> = { inbox: true }) => ({
  id, blobId: `blob-${id}`, threadId: `t-${id}`, size: 100, subject, keywords: {}, mailboxIds,
  receivedAt: '2026-10-01T10:00:00Z', from: [{ email: 'promo@spam.example' }],
}) as unknown as Email;
const e1 = email('e1', 'Cheap pills');
const e2 = email('e2', 'You won');

const hoisted = vi.hoisted(() => {
  const client = {
    getIdentities: async () => [{ id: 'id-me', name: 'Me', email: 'me@example.org' }],
    getUsername: () => 'me@example.org',
    getAccountId: () => 'acc',
    resolveSendAccountId: async () => 'acc',
    copyBlobs: async () => ({}),
    sendEmail: vi.fn(async (..._args: unknown[]) => ({ scheduled: false })),
  };
  const store = {
    emails: [] as Email[],
    mailboxes: [{ id: 'inbox', role: 'inbox' }, { id: 'sent-box', role: 'sent' }],
    selectedEmail: null as Email | null,
    deleteEmail: vi.fn(async (..._args: unknown[]) => true),
  };
  return { client, store };
});

vi.mock('@/stores/auth-store', () => {
  const state = { client: hoisted.client, activeAccountId: null, getClientForAccount: () => undefined };
  const hook = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  hook.getState = () => state;
  hook.subscribe = () => () => {};
  return { useAuthStore: hook };
});
vi.mock('@/stores/email-store', () => ({
  useEmailStore: Object.assign(
    (sel?: (s: typeof hoisted.store) => unknown) => (sel ? sel(hoisted.store) : hoisted.store),
    { getState: () => hoisted.store },
  ),
  resolveEmailActionContext: () => ({ client: hoisted.client, mailboxes: [], accountId: undefined }),
}));

const { SpamReportHost } = await import('../spam-report-host');
const { requestSpamReport } = await import('@/lib/spam-report-flow');

function setAddress(address: string, note: { includeNote?: boolean; note?: string } = {}) {
  usePolicyStore.setState({
    policy: {
      ...DEFAULT_POLICY,
      organisation: { ...DEFAULT_ORGANISATION_POLICY, spamReport: { address, format: 'forward', includeNote: false, note: '', ...note } },
    },
  });
}

beforeEach(() => {
  hoisted.store.emails = [e1, e2];
  setAddress('spam@mxguarddog.com');
  useSettingsStore.setState({ spamReportNoConfirm: false });
});
afterEach(() => {
  cleanup();
  usePolicyStore.setState({ policy: DEFAULT_POLICY });
  useToastStore.setState({ toasts: [] });
  useSpamReportStore.setState({ pending: null, busy: false });
  useSettingsStore.setState({ spamReportNoConfirm: false });
  vi.clearAllMocks();
});

describe('Mark as spam with a spam report address', () => {
  it('leaves Mark as spam alone while no address is set', () => {
    setAddress('');
    expect(requestSpamReport([e1])).toBe(false);
    expect(useSpamReportStore.getState().pending).toBeNull();
  });

  it('leaves the user\'s own sent mail to the move to Junk', () => {
    expect(requestSpamReport([email('s1', 'Mine', { 'sent-box': true })])).toBe(false);
  });

  it('asks, and Cancel sends and deletes nothing', () => {
    render(<SpamReportHost />);
    act(() => { expect(requestSpamReport([e1])).toBe(true); });
    expect(screen.getByTestId('spam-report-dialog')).toBeTruthy();
    fireEvent.click(screen.getByTestId('spam-report-cancel'));
    expect(screen.queryByTestId('spam-report-dialog')).toBeNull();
    expect(hoisted.client.sendEmail).not.toHaveBeenCalled();
    expect(hoisted.store.deleteEmail).not.toHaveBeenCalled();
  });

  it('reports each message with the original attached, then deletes it', async () => {
    render(<SpamReportHost />);
    act(() => { requestSpamReport([e1, e2]); });
    await act(async () => { fireEvent.click(screen.getByTestId('spam-report-confirm')); });
    const calls = hoisted.client.sendEmail.mock.calls as unknown[][];
    expect(calls.map((c) => c[0])).toEqual([['spam@mxguarddog.com'], ['spam@mxguarddog.com']]);
    expect(calls.map((c) => c[1])).toEqual(['Spam: Cheap pills', 'Spam: You won']);
    expect(calls.map((c) => c[2])).toEqual(['', '']);
    expect((calls[0][10] as Array<{ type: string; blobId: string }>)[0]).toMatchObject({ type: 'message/rfc822', blobId: 'blob-e1' });
    expect(hoisted.store.deleteEmail).toHaveBeenCalledTimes(2);
    expect(hoisted.store.deleteEmail).toHaveBeenCalledWith(hoisted.client, 'e1', false, 'e1');
    expect(useSettingsStore.getState().spamReportNoConfirm).toBe(false);
  });

  it('remembers "Don\'t ask again" and then reports at once', async () => {
    render(<SpamReportHost />);
    act(() => { requestSpamReport([e1]); });
    fireEvent.click(screen.getByTestId('spam-report-dont-ask'));
    await act(async () => { fireEvent.click(screen.getByTestId('spam-report-confirm')); });
    expect(useSettingsStore.getState().spamReportNoConfirm).toBe(true);
    vi.clearAllMocks();
    await act(async () => { requestSpamReport([e2]); });
    expect(screen.queryByTestId('spam-report-dialog')).toBeNull();
    await waitFor(() => expect(hoisted.store.deleteEmail).toHaveBeenCalledWith(hoisted.client, 'e2', false, 'e2'));
    expect(hoisted.client.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('adds the note only when the admin turned it on, with the reporter filled in', async () => {
    const bodies: string[] = [];
    render(<SpamReportHost />);
    for (const note of [{ includeNote: true }, { includeNote: true, note: 'Spam for {reporter}\nPlease review.' }]) {
      setAddress('review@gateway.example', note);
      act(() => { requestSpamReport([e1]); });
      await act(async () => { fireEvent.click(screen.getByTestId('spam-report-confirm')); });
      bodies.push((hoisted.client.sendEmail.mock.calls.at(-1) as unknown[])[2] as string);
    }
    expect(bodies).toEqual([
      'Reported as spam by Me <me@example.org> with Bulwark.\r\nThe reported message is attached unchanged.\r\n',
      'Spam for Me <me@example.org>\r\nPlease review.\r\n',
    ]);
  });

  it('keeps a message whose report did not go out', async () => {
    hoisted.client.sendEmail.mockRejectedValueOnce(new Error('refused'));
    render(<SpamReportHost />);
    act(() => { requestSpamReport([e1, e2]); });
    await act(async () => { fireEvent.click(screen.getByTestId('spam-report-confirm')); });
    expect(hoisted.store.deleteEmail).toHaveBeenCalledTimes(1);
    expect(hoisted.store.deleteEmail).toHaveBeenCalledWith(hoisted.client, 'e2', false, 'e2');
    expect(useToastStore.getState().toasts.some((t) => t.type === 'error')).toBe(true);
  });
});
