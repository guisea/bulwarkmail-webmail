import type { InboundGateway } from "@/lib/email-headers";
import { usePolicyStore } from "@/stores/policy-store";

/**
 * The inbound gateway the admin named (Organisation > Security > Inbound
 * gateway, policy.json `organisation.inboundGateway`), or undefined when none
 * is set. The MX records of the whole organisation point at the gateway, so
 * the signed-in account's policy answers for every account's mail; reading
 * it straight from the store keeps this cheap enough for every list row.
 */
export function useInboundGateway(): InboundGateway | undefined {
  const gateway = usePolicyStore((s) => s.policy?.organisation?.inboundGateway);
  return gateway && gateway.domains.length > 0 ? gateway : undefined;
}
