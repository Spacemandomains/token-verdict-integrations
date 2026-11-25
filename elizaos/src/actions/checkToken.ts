// CHECK_TOKEN — ElizaOS action for Token Verdict
// ================================================
// POST a Base token address to Token Verdict ($0.02/call, USDC on Base
// via x402) and reply with the verdict card: verdict + 0-100 score +
// cited facts (liquidity, holder concentration, honeypot/mint flags).
//
// Payment is handled inside the handler with @x402/fetch — the same
// client pattern used for Token Verdict's own settled calls. The
// agent's EVM key comes from the character settings
// (EVM_PRIVATE_KEY) or the environment. Keep only a small USDC float
// in that wallet: each check costs exactly $0.02, and a failed check
// (HTTP 502 from the endpoint) is never settled / never charged.

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
} from "@elizaos/core";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

export const TOKEN_VERDICT_URL =
  "https://crypto-intel-agent.vercel.app/api/token-verdict";

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

async function fetchVerdict(address: string, privateKey: string) {
  const signer = privateKeyToAccount(privateKey as `0x${string}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const res = await fetchWithPayment(TOKEN_VERDICT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, chain: "base" }),
  });
  if (!res.ok) throw new Error(`Token Verdict HTTP ${res.status}`);
  return res.json();
}

export const checkTokenAction: Action = {
  name: "CHECK_TOKEN",
  similes: ["TOKEN_VERDICT", "CHECK_TOKEN_SAFETY", "IS_THIS_TOKEN_A_RUG"],
  description:
    "Check a Base token for rug / honeypot risk BEFORE trading it. " +
    "Costs $0.02 via x402. Returns a verdict (clean / caution / rug_risk / " +
    "exit_trap), a 0-100 score, and the cited facts behind it: liquidity, " +
    "top-holder concentration, honeypot, mint and tax flags. Use whenever " +
    "a token contract address appears and a buy, swap or recommendation " +
    "is being considered.",

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content?.text ?? "";
    return ADDRESS_RE.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const text = message.content?.text ?? "";
    const address = text.match(ADDRESS_RE)?.[0];
    if (!address) {
      await callback?.({ text: "I need a Base token contract address (0x…) to check." });
      return { success: false, error: "no_address" } as any;
    }

    const privateKey =
      (runtime.getSetting?.("EVM_PRIVATE_KEY") as string) || process.env.EVM_PRIVATE_KEY;
    if (!privateKey) {
      await callback?.({
        text: "Token Verdict is not configured: set EVM_PRIVATE_KEY (a wallet with a small USDC float on Base) in the character settings.",
      });
      return { success: false, error: "no_key" } as any;
    }

    try {
      const card: any = await fetchVerdict(address, privateKey);
      const reasons = (card.reasons ?? []).map((r: string) => `• ${r}`).join("\n");
      const reply =
        `Token Verdict for ${address}\n` +
        `Verdict: ${card.verdict} — score ${card.score}/100\n` +
        (reasons ? `${reasons}\n` : "") +
        (card.verdict === "rug_risk" || card.verdict === "exit_trap"
          ? "Do NOT trade this token."
          : card.verdict === "caution"
            ? "Trade small or skip — risk flags above."
            : "No blocking risk flags found.");
      await callback?.({ text: reply, actions: ["CHECK_TOKEN"] });
      return { success: true, data: card } as any;
    } catch (err) {
      await callback?.({
        text: `I could not get a verdict for ${address} — the check failed, and a failed check is never charged. Try again shortly.`,
      });
      return { success: false, error: String(err) } as any;
    }
  },

  examples: [
    [
      {
        name: "user",
        content: {
          text: "Should I buy 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913?",
        },
      },
      {
        name: "agent",
        content: {
          text: "Checking it before any trade — one moment.",
          actions: ["CHECK_TOKEN"],
        },
      },
    ],
    [
      {
        name: "user",
        content: {
          text: "Is this token a rug? 0x0000000000000000000000000000000000000000",
        },
      },
      {
        name: "agent",
        content: {
          text: "Running the safety check on that address now.",
          actions: ["CHECK_TOKEN"],
        },
      },
    ],
  ] as any,
};
