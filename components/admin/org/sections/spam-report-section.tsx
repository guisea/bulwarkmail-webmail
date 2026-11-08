'use client';

import { useEffect, useId, useState } from 'react';
import { Info } from '@/components/icons';
import { SettingItem, SettingsSection, ToggleSwitch } from '@/components/settings/settings-section';
import { DEFAULT_SPAM_NOTE } from '@/lib/phishing-report';
import { isPhishingReportAddress, type PhishingReportFormat } from '@/lib/admin/organisation-policy';
import { cn } from '@/lib/utils';
import { InheritNote } from '../org-page';
import type { OrgPolicyDraft } from '../use-org-policy-draft';

const FORMATS: Array<{ value: PhishingReportFormat; label: string; description: string }> = [
  {
    value: 'forward',
    label: 'Forward as an attachment',
    description: 'The message goes out whole as an .eml attachment, with the subject "Spam: <subject>". What spam filters such as MXGuardDog learn from.',
  },
  {
    value: 'arf',
    label: 'Abuse report (ARF)',
    description: 'A machine-readable report (RFC 5965, Feedback-Type: abuse) with the message attached. For abuse desks and tools that parse feedback reports.',
  },
];

const inputClass =
  'h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground ' +
  'focus-visible:outline-hidden focus-visible:border-ring sm:w-72';

/**
 * Organisation > Security > Spam reports: where "Mark as spam" sends a
 * message before deleting it, e.g. the inbound gateway's spam address
 * (policy.json `organisation.spamReport`). Empty leaves "Mark as spam" as a
 * move to Junk.
 */
export function SpamReportSection({ draft }: { draft: OrgPolicyDraft }) {
  const address = draft.orgValue('spamReport', 'address');
  const format = draft.orgValue('spamReport', 'format');
  const includeNote = draft.orgValue('spamReport', 'includeNote');
  const note = draft.orgValue('spamReport', 'note');
  const id = useId();
  // Stored when the field is left, so typing doesn't save on every key.
  const [noteText, setNoteText] = useState(note.value);
  useEffect(() => { setNoteText(note.value); }, [note.value]);

  // Typed freely, stored only once it is an address (or empty, which turns
  // the action off): the policy never holds half an address.
  const [text, setText] = useState(address.value);
  useEffect(() => { setText(address.value); }, [address.value]);
  const trimmed = text.trim().toLowerCase();
  const invalid = trimmed !== '' && !isPhishingReportAddress(trimmed);
  const postmaster = /^postmaster@/i.test(trimmed);
  const onText = (value: string) => {
    setText(value);
    const next = value.trim().toLowerCase();
    if (next !== '' && !isPhishingReportAddress(next)) return;
    if (next !== address.value || !address.own) draft.setOrgValue('spamReport', 'address', next);
  };

  return (
    <SettingsSection
      id="spam"
      title="Spam reports"
      description="Turns “Mark as spam” into a report: Bulwark sends the message to the address below, one report per message, without a copy in Sent, and then deletes it as the user's Delete would, instead of moving it to Junk. Users confirm, and can choose not to be asked again."
    >
      <SettingItem
        label="Send reports to"
        description="The spam address of your filtering service, e.g. spam@mxguarddog.com. Empty leaves “Mark as spam” as a move to Junk."
      >
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <input
            id={`${id}-address`}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="spam@mxguarddog.com"
            value={text}
            onChange={(e) => onText(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            data-testid="org-spam-address"
            className={cn(inputClass, invalid ? 'border-red-500' : 'border-input')}
          />
          {invalid && (
            <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400" role="alert">
              This isn&apos;t an email address. The saved address stays until you enter a valid one.
            </p>
          )}
          {postmaster && (
            <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="org-spam-postmaster">
              Don&apos;t use postmaster@: Stalwart analyses mail to it as reports.
            </p>
          )}
          <InheritNote
            draft={draft}
            own={address.own}
            everyone={address.everyone || 'off'}
            onReset={() => draft.clearOrgValue('spamReport', 'address')}
          />
        </div>
      </SettingItem>

      <SettingItem label="Report format" description="What the report looks like when it arrives.">
        <div className="flex w-full flex-col gap-2 sm:w-80" role="radiogroup" aria-label="Report format">
          {FORMATS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm',
                format.value === option.value ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              <input
                type="radio"
                name={`${id}-format`}
                value={option.value}
                checked={format.value === option.value}
                onChange={() => draft.setOrgValue('spamReport', 'format', option.value)}
                className="mt-0.5"
                data-testid={`org-spam-format-${option.value}`}
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
          <InheritNote
            draft={draft}
            own={format.own}
            everyone={FORMATS.find((f) => f.value === format.everyone)?.label ?? format.everyone}
            onReset={() => draft.clearOrgValue('spamReport', 'format')}
          />
        </div>
      </SettingItem>

      <SettingItem
        label="Note above the attachment"
        description="Off sends the subject and the attached message only, which is what spam filters read. Turn it on for a gateway whose reports a person reviews."
      >
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <ToggleSwitch checked={includeNote.value} onChange={(v) => draft.setOrgValue('spamReport', 'includeNote', v)} testId="org-spam-include-note" />
          <InheritNote draft={draft} own={includeNote.own} everyone={includeNote.everyone ? 'on' : 'off'} onReset={() => draft.clearOrgValue('spamReport', 'includeNote')} />
        </div>
      </SettingItem>

      {includeNote.value && (
        <div className="space-y-2 py-3">
          <label htmlFor={`${id}-note`} className="text-sm font-medium text-foreground">Note</label>
          <p className="text-xs text-muted-foreground">
            Plain text. {'{reporter}'} becomes the user&apos;s name and address. Empty uses the text shown. ARF reports keep their own text.
          </p>
          <textarea
            id={`${id}-note`}
            data-testid="org-spam-note"
            rows={3}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onBlur={(e) => { if (e.target.value !== note.value) draft.setOrgValue('spamReport', 'note', e.target.value); }}
            placeholder={DEFAULT_SPAM_NOTE}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden"
          />
          <InheritNote draft={draft} own={note.own} everyone={note.everyone || 'default'} onReset={() => draft.clearOrgValue('spamReport', 'note')} />
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          Reports go out without the organisation signature, disclaimer, label or plugin checks. Deleting follows each
          user&apos;s Delete setting (to Trash, or for good). A message that couldn&apos;t be reported stays where it is.
        </p>
      </div>
    </SettingsSection>
  );
}
