import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// Organisation > Security > Spam reports: the optional note above the attachment.

const puts: Array<Record<string, unknown>> = [];
let stored: Record<string, unknown> = {};
vi.mock('@/lib/browser-navigation', () => ({
  apiFetch: vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      puts.push(body);
      stored = body;
      return new Response('{"ok":true}');
    }
    return new Response(JSON.stringify(stored));
  }),
  withBasePath: (p: string) => p,
  getPathPrefix: () => '',
}));

import { SpamReportSection } from '../sections/spam-report-section';
import { useOrgPolicyDraft, useOrgScopeStore, EVERYONE } from '../use-org-policy-draft';

const POLICY = {
  restrictions: {}, features: {}, defaults: {}, themePolicy: {},
  forceEnabledPlugins: [], approvedPlugins: [], forceEnabledThemes: [],
  organisation: {},
  scopes: [{ id: 'team', label: 'Team', match: { groups: ['team@example.org'] }, policy: {} }],
};

let latest: ReturnType<typeof useOrgPolicyDraft> | null = null;
function Harness() {
  const draft = useOrgPolicyDraft('test');
  latest = draft;
  if (draft.loading) return null;
  return <SpamReportSection draft={draft} />;
}

async function renderSection() {
  render(<Harness />);
  await waitFor(() => expect(screen.getByTestId('org-spam-address')).toBeInTheDocument());
}

beforeEach(() => {
  puts.length = 0;
  stored = JSON.parse(JSON.stringify(POLICY));
  latest = null;
  useOrgScopeStore.setState({ scopeId: EVERYONE });
});

describe('Spam reports section', () => {
  it('sends no note until it is turned on, then offers the default text as the placeholder', async () => {
    await renderSection();
    expect(latest!.orgValue('spamReport', 'includeNote').value).toBe(false);
    expect(screen.queryByTestId('org-spam-note')).toBeNull();
    fireEvent.click(screen.getByTestId('org-spam-include-note'));
    const note = await screen.findByTestId('org-spam-note');
    expect(note.getAttribute('placeholder')).toContain('{reporter}');
    fireEvent.change(note, { target: { value: 'Spam from {reporter}' } });
    fireEvent.blur(note);
    expect(latest!.orgValue('spamReport', 'includeNote').value).toBe(true);
    expect(latest!.orgValue('spamReport', 'note').value).toBe('Spam from {reporter}');
  });
});
