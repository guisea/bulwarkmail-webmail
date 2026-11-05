import { create } from 'zustand';
import type { Email } from '@/lib/jmap/types';

/**
 * A spam report waiting to run (lib/spam-report-flow.ts). The host mounted
 * in the app layout (components/email/spam-report-host.tsx) asks first when
 * `confirm` is set, else sends at once, and shows the outcome.
 */
interface SpamReportState {
  pending: { emails: Email[]; addresses: string[]; confirm: boolean } | null;
  /** The reports are on their way; nothing more is taken until they are done. */
  busy: boolean;
  ask: (emails: Email[], addresses: string[], confirm: boolean) => void;
  close: () => void;
  setBusy: (busy: boolean) => void;
}

export const useSpamReportStore = create<SpamReportState>()((set, get) => ({
  pending: null,
  busy: false,
  ask: (emails, addresses, confirm) => {
    if (get().busy || get().pending || emails.length === 0) return;
    set({ pending: { emails, addresses, confirm } });
  },
  close: () => set({ pending: null, busy: false }),
  setBusy: (busy) => set({ busy }),
}));
