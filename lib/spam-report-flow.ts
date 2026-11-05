/**
 * "Mark as spam" while the admin set organisation.spamReport (e.g. the
 * inbound gateway's spam address, spam@mxguarddog.com): each message goes
 * to that address as its own report, the way "Report phishing" sends one
 * (lib/phishing-report.ts, original attached unchanged, no copy in Sent),
 * and is then deleted as the user's Delete would, instead of moved to Junk.
 *
 * Every "Mark as spam" entry point asks requestSpamReport first; it answers
 * false while reporting is off for the messages, and the move to Junk runs
 * as before. The question, the "don't ask again" and the outcome are the
 * host's (components/email/spam-report-host.tsx).
 */

import type { Email, Mailbox } from '@/lib/jmap/types';
import { subjectForAccount } from '@/lib/org/account-subjects';
import { emailKeyFor } from '@/lib/thread-utils';
import { debug } from '@/lib/debug';
import { useAuthStore } from '@/stores/auth-store';
import { resolveEmailActionContext, useEmailStore } from '@/stores/email-store';
import { usePolicyStore } from '@/stores/policy-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useSpamReportStore } from '@/stores/spam-report-store';
import { isReportable, sendPhishingReport, spamReportSetup, type ArfInput, type PhishingReportSetup } from './phishing-report';

/** The spam report setup for a message, from the policy of the account it is in. */
export function spamSetupForEmail(email: Pick<Email, 'sourceClientAccountId'> | null | undefined): PhishingReportSetup | null {
  const view = usePolicyStore.getState();
  const subject = subjectForAccount(email?.sourceClientAccountId ?? null);
  const policy = subject === view.subject ? view.policy : view.resolveFor(subject);
  return spamReportSetup(policy);
}

function folderRoles(email: Email, mailboxes: Mailbox[]): string[] {
  const roles: string[] = [];
  for (const id of Object.keys(email.mailboxIds ?? {})) {
    const box = mailboxes.find((m) => m.id === id || m.originalId === id);
    if (box?.role) roles.push(box.role);
  }
  return roles;
}

/**
 * Takes over "Mark as spam" for `emails` when every one of them has a spam
 * report address and can be reported (not the user's own sent mail or a
 * draft). Answers whether it did: then the caller does nothing more, even
 * when the user cancels the question.
 */
export function requestSpamReport(emails: Email[]): boolean {
  if (emails.length === 0) return false;
  const mailboxes = useEmailStore.getState().mailboxes;
  const setups = emails.map((email) => spamSetupForEmail(email));
  if (setups.some((setup) => !setup)) return false;
  if (!emails.every((email) => isReportable(email, null, folderRoles(email, mailboxes)))) return false;
  const addresses = [...new Set(setups.map((setup) => setup!.address))];
  useSpamReportStore.getState().ask(emails, addresses, !useSettingsStore.getState().spamReportNoConfirm);
  return true;
}

export interface SpamReportOutcome {
  addresses: string[];
  /** Reported and deleted. */
  deleted: Email[];
  /** Reported, but the delete failed or a plugin stopped it. */
  notDeleted: Email[];
  /** Not reported, so left where they are. */
  failed: Email[];
}

async function loadArfBuilder(): Promise<(input: ArfInput) => Promise<Blob>> {
  const { buildArfReportBlob } = await import('./phishing-report-arf');
  return buildArfReportBlob;
}

/** Reports each message on its own, then deletes the ones that went out. */
export async function reportEmailsAsSpam(emails: Email[]): Promise<SpamReportOutcome> {
  const active = useAuthStore.getState().client;
  if (!active) throw new Error('Not signed in');
  const outcome: SpamReportOutcome = { addresses: [], deleted: [], notDeleted: [], failed: [] };
  let buildArf: ((input: ArfInput) => Promise<Blob>) | undefined;

  for (const email of emails) {
    const setup = spamSetupForEmail(email);
    if (!setup) {
      outcome.failed.push(email);
      continue;
    }
    if (!outcome.addresses.includes(setup.address)) outcome.addresses.push(setup.address);
    const { client, accountId } = resolveEmailActionContext(email, active);
    try {
      if (setup.format === 'arf' && !buildArf) buildArf = await loadArfBuilder();
      await sendPhishingReport(email, { client, sourceAccountId: accountId ?? client.getAccountId(), setup, buildArf, kind: 'spam' });
    } catch (error) {
      debug.error('Spam report failed:', error);
      outcome.failed.push(email);
      continue;
    }
    // As the user's Delete: to Trash or for good, by their setting, with
    // the plugins' onBeforeEmailDelete. A message the list doesn't hold
    // (a Pro tab) stays; the toast says so.
    try {
      const deleted = await useEmailStore.getState().deleteEmail(active, email.id, false, emailKeyFor(email));
      (deleted ? outcome.deleted : outcome.notDeleted).push(email);
    } catch (error) {
      debug.error('Deleting a reported message failed:', error);
      outcome.notDeleted.push(email);
    }
  }
  return outcome;
}
