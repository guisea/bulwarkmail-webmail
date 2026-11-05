'use client';

import { useEffect, useId, useState } from 'react';
import { Info } from '@/components/icons';
import { SettingItem, SettingsSection } from '@/components/settings/settings-section';
import { parseDomainList } from '@/lib/admin/organisation-policy';
import type { InboundGatewayMode } from '@/lib/email-headers';
import { toUnicodeDomain } from '@/lib/idn';
import { cn } from '@/lib/utils';
import { InheritNote } from '../org-page';
import type { OrgPolicyDraft } from '../use-org-policy-draft';

const MODES: Array<{ value: InboundGatewayMode; label: string; description: string }> = [
  {
    value: 'soften',
    label: 'Show a neutral note',
    description: 'Mail the gateway relayed without a signature from its sender gets a grey “Via mail filter” note instead of the unverified or failed warning.',
  },
  {
    value: 'hide',
    label: 'Show nothing',
    description: 'No note at all for such mail. Use this when you trust the gateway to stop forged senders.',
  },
];

/**
 * Organisation > Security > Inbound gateway: the filtering service the MX
 * records point at (policy.json `organisation.inboundGateway`). Mail it relays
 * passes SPF for the gateway, not for the sender, so the sender check
 * softens or drops its warning for such mail. Off while no domain is set.
 */
export function InboundGatewaySection({ draft }: { draft: OrgPolicyDraft }) {
  const domains = draft.orgValue('inboundGateway', 'domains');
  const mode = draft.orgValue('inboundGateway', 'mode');
  const id = useId();

  // Typed as text and taken apart when the field is left, like the
  // organisation domains of External mail.
  const stored = domains.value.join('\n');
  const joined = domains.value.map(toUnicodeDomain).join('\n');
  const [text, setText] = useState(joined);
  const [rejected, setRejected] = useState<string[]>([]);
  useEffect(() => { setText(joined); }, [joined]);
  const commitDomains = (raw: string) => {
    const parsed = parseDomainList(raw) ?? { domains: [], rejected: [] };
    setRejected(parsed.rejected);
    if (parsed.domains.join('\n') !== stored) draft.setOrgValue('inboundGateway', 'domains', parsed.domains);
    else setText(joined);
  };

  return (
    <SettingsSection
      id="inbound-gateway"
      title="Inbound gateway"
      description="If your MX records point at a filtering service that forwards mail to your mail server, name it here. The mail server then sees the gateway as the sender, so mail without a signature from its real sender would otherwise be flagged as unverified or failed."
    >
      <div className="space-y-2 py-3">
        <label htmlFor={`${id}-domains`} className="text-sm font-medium text-foreground">Gateway domains</label>
        <p className="text-xs text-muted-foreground">
          The domain in the envelope sender of mail the gateway forwards, as your mail server&apos;s SPF result names it (ik2.com for MXGuardDog). A domain covers its subdomains. Empty turns this off.
        </p>
        <textarea
          id={`${id}-domains`}
          data-testid="org-inbound-gateway-domains"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitDomains(e.target.value)}
          placeholder="ik2.com"
          spellCheck={false}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden"
        />
        {rejected.length > 0 && (
          <p className="text-xs text-destructive" role="status" data-testid="org-inbound-gateway-rejected">
            Left out, not a domain: {rejected.join(', ')}
          </p>
        )}
        <InheritNote
          draft={draft}
          own={domains.own}
          everyone={domains.everyone.length ? domains.everyone.map(toUnicodeDomain).join(', ') : 'none'}
          onReset={() => draft.clearOrgValue('inboundGateway', 'domains')}
        />
      </div>

      <SettingItem label="Unsigned forwarded mail" description="What users see for mail the gateway relayed that no signature of its sender's domain backs.">
        <div className="flex w-full flex-col gap-2 sm:w-80" role="radiogroup" aria-label="Unsigned forwarded mail">
          {MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm',
                mode.value === option.value ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                value={option.value}
                checked={mode.value === option.value}
                onChange={() => draft.setOrgValue('inboundGateway', 'mode', option.value)}
                className="mt-0.5"
                data-testid={`org-inbound-gateway-mode-${option.value}`}
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
          <InheritNote
            draft={draft}
            own={mode.own}
            everyone={MODES.find((m) => m.value === mode.everyone)?.label ?? mode.everyone}
            onReset={() => draft.clearOrgValue('inboundGateway', 'mode')}
          />
        </div>
      </SettingItem>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          Only mail whose SPF check passed for a gateway domain counts. Mail signed by its sender&apos;s own domain shows no warning either way, and a broken signature of that domain is still flagged as failed. Remote content stays blocked for unverified senders.
        </p>
      </div>
    </SettingsSection>
  );
}
