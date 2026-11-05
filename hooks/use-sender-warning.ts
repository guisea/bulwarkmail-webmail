"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { getSenderVerification } from "@/lib/email-headers";
import type { Email } from "@/lib/jmap/types";
import { useInboundGateway } from "@/hooks/use-inbound-gateway";

/**
 * The sender-check label for a message whose From the receiving server's
 * checks don't back, the same verdict as the notice in the message view.
 * Avatars show it instead of the claimed sender's favicon or photo (#1439).
 * Undefined when the check passed or there are no results to judge by.
 */
export function useSenderWarning(
  email: Pick<Email, "from" | "authenticationResults"> | undefined,
): string | undefined {
  const t = useTranslations("email_viewer.sender_check");
  const results = email?.authenticationResults;
  const sender = email?.from?.[0]?.email;
  // Every message row asks on every render; the headers only change with the message.
  const hasEmail = !!email;
  const gateway = useInboundGateway();
  const verification = useMemo(
    () => (hasEmail ? getSenderVerification(results, sender, gateway) : null),
    [hasEmail, results, sender, gateway],
  );
  // Mail the inbound gateway relayed gets the neutral note in the message
  // view only: a warning shield on every row it forwarded is the noise the
  // gateway setting exists to remove.
  if (!verification || verification.status === "forwarded") return undefined;
  return verification.status === "failed" ? t("failed_label") : t("unverified_label");
}
