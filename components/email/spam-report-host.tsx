'use client';

import { useCallback, useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldAlert } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { reportEmailsAsSpam, type SpamReportOutcome } from '@/lib/spam-report-flow';
import { useSettingsStore } from '@/stores/settings-store';
import { useSpamReportStore } from '@/stores/spam-report-store';
import { toast } from '@/stores/toast-store';

/**
 * "Report spam?" with the address the reports go to and "Don't ask again",
 * then one report per message, each deleted once it went out. Mounted once
 * in the app layout; "Mark as spam" asks through requestSpamReport.
 */
export function SpamReportHost() {
  const t = useTranslations('spam_report');
  const pending = useSpamReportStore((s) => s.pending);
  const busy = useSpamReportStore((s) => s.busy);
  const [dontAsk, setDontAsk] = useState(false);
  const id = useId();
  const asking = !!pending?.confirm;
  const dialogRef = useFocusTrap({ isActive: asking, restoreFocus: true });

  const showOutcome = useCallback((outcome: SpamReportOutcome) => {
    const address = outcome.addresses.join(', ');
    if (outcome.deleted.length > 0) toast.success(t('done', { address, count: outcome.deleted.length }));
    if (outcome.notDeleted.length > 0) toast.warning(t('not_deleted', { address, count: outcome.notDeleted.length }));
    if (outcome.failed.length > 0) {
      toast.error(t('failed', { count: outcome.failed.length }), {
        message: outcome.failed.map((email) => email.subject || t('no_subject')).join(', '),
      });
    }
  }, [t]);

  const run = useCallback(async () => {
    const state = useSpamReportStore.getState();
    if (!state.pending || state.busy) return;
    state.setBusy(true);
    const emails = state.pending.emails;
    let outcome: SpamReportOutcome | null = null;
    try {
      outcome = await reportEmailsAsSpam(emails);
    } catch {
      outcome = null;
    }
    useSpamReportStore.getState().close();
    if (outcome) showOutcome(outcome);
    else toast.error(t('failed', { count: emails.length }));
  }, [showOutcome, t]);

  // "Don't ask again" was ticked before: report at once.
  useEffect(() => {
    if (pending && !pending.confirm && !busy) void run();
  }, [pending, busy, run]);

  useEffect(() => {
    if (asking) setDontAsk(false);
  }, [asking]);

  const cancel = () => {
    if (!busy) useSpamReportStore.getState().close();
  };

  const confirm = () => {
    if (dontAsk) useSettingsStore.getState().updateSetting('spamReportNoConfirm', true);
    void run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) {
      e.preventDefault();
      e.target.click();
    }
  };

  if (!pending || !pending.confirm) return null;
  const count = pending.emails.length;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px] animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        aria-busy={busy || undefined}
        data-testid="spam-report-dialog"
        className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-xl animate-in zoom-in-95 duration-200"
      >
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">{t('confirm_title')}</h2>
              <p id={`${id}-message`} className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {t('confirm_message', { address: pending.addresses.join(', '), count })}
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={dontAsk}
                  onChange={(e) => setDontAsk(e.target.checked)}
                  disabled={busy}
                  data-testid="spam-report-dont-ask"
                />
                {t('dont_ask')}
              </label>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 sm:px-6">
          <Button variant="outline" onClick={cancel} disabled={busy} data-testid="spam-report-cancel">
            {t('cancel')}
          </Button>
          <Button onClick={confirm} disabled={busy} data-testid="spam-report-confirm">
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? t('sending') : t('confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
