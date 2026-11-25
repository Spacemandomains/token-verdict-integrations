// Token Verdict for Coinbase AgentKit — pre-trade token screen
// =============================================================
// Add a $0.02 pre-trade safety check to any AgentKit agent on Base.
//
//   Input : a Base token contract address
//   Output: { verdict: "clean" | "caution" | "rug_risk" | "exit_trap",
//             score: 0-100, reasons: [...], facts: {...} }
//           Every score cites its facts — liquidity, top-holder %,
//           honeypot / mint / tax flags. No black-box score.
//
// How it works: AgentKit already ships an x402 action provider
// (x402ActionProvider). It reads the endpoint's 402 challenge, pays
// USDC from the agent's wallet, and retries — no API key, no extra
// payment code. You just whitelist the service and call the action
// before any swap.
//
// Install:  npm i @coinbase/agentkit viem
// Run:      EVM_PRIVATE_KEY=0x... npx tsx token-verdict-agentkit.ts 0x<token>
//
// SPEND SAFETY: make_http_request_with_x402 pays whatever the 402
// asks — it has no cap of its own. This snippet pins the expected
// price ($0.02) in the prompt/guard below and you should keep only a
// small USDC float in the agent wallet.

import { AgentKit, ViemWalletProvider, x402ActionProvider } from "@coinbase/agentkit";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

export const TOKEN_VERDICT_URL =
  "https://crypto-intel-agent.vercel.app/api/token-verdict";
export const TOKEN_VERDICT_PRICE_USD = 0.02;

export async function createTokenVerdictAgentKit(privateKey: `0x${string}`) {
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: base,
    transport: http(),
  });
  const walletProvider = new ViemWalletProvider(walletClient);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      // Whitelist Token Verdict's origin and cap a single payment.
      // (Config options follow the X402ActionProvider README:
      //  registeredServices + maxPaymentUsdc.)
      x402ActionProvider({
        registeredServices: ["https://crypto-intel-agent.vercel.app"],
        maxPaymentUsdc: TOKEN_VERDICT_PRICE_USD,
      } as any),
    ],
  });
  return { agentkit, walletProvider };
}

/**
 * Direct call (no LLM in the loop): pay $0.02 and return the verdict card.
 * Use this inside your swap flow, right before the trade fires.
 */
export async function checkTokenBeforeTrade(
  agentkit: AgentKit,
  tokenAddress: string,
): Promise<{ allowed: boolean; card: any }> {
  const action = agentkit
    .getActions()
    .find((a) => a.name.endsWith("make_http_request_with_x402"));
  if (!action) throw new Error("x402 action not found — is x402ActionProvider loaded?");

  const raw = await action.invoke({
    url: TOKEN_VERDICT_URL,
    method: "POST",
    body: { address: tokenAddress, chain: "base" },
  } as any);

  const card = typeof raw === "string" ? JSON.parse(raw) : raw;
  const verdict = card?.verdict ?? card?.data?.verdict;
  return {
    allowed: verdict === "clean" || verdict === "caution",
    card,
  };
}

// --- Example: gate a trade on the verdict ---------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.argv[2] || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC
  const key = process.env.EVM_PRIVATE_KEY as `0x${string}`;
  if (!key) throw new Error("Set EVM_PRIVATE_KEY (agent wallet, USDC on Base)");

  const { agentkit } = await createTokenVerdictAgentKit(key);
  const { allowed, card } = await checkTokenBeforeTrade(agentkit, token);
  console.log(JSON.stringify(card, null, 2));
  console.log(
    allowed
      ? "VERDICT GATE: PASS — proceed with the trade."
      : "VERDICT GATE: BLOCKED — do not trade this token.",
  );

  // With an LLM instead: hand `agentkit` to @coinbase/agentkit-langchain
  // (getLangChainTools) and put this line in the system prompt:
  //
  //   "Before any token purchase, call make_http_request_with_x402 with a
  //    POST to https://crypto-intel-agent.vercel.app/api/token-verdict
  //    and body {\"address\": \"<token>\", \"chain\": \"base\"}. It costs
  //    $0.02. Only proceed if the returned verdict is clean or caution.
  //    If it is rug_risk or exit_trap, refuse the trade and show the
  //    reasons from the verdict card."
}
