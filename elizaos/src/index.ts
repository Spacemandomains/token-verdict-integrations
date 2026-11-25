// @elizaos/plugin-token-verdict
// ==============================
// Pre-trade token safety for ElizaOS characters on Base.
// One action: CHECK_TOKEN — $0.02/call via x402, no API key.
//
// Add to a character file:
//   "plugins": ["@elizaos/plugin-token-verdict"]
// and set EVM_PRIVATE_KEY in the character settings / .env
// (a wallet holding a small USDC float on Base).

import type { Plugin } from "@elizaos/core";
import { checkTokenAction } from "./actions/checkToken.js";

export const tokenVerdictPlugin: Plugin = {
  name: "plugin-token-verdict",
  description:
    "Token Verdict — pre-trade Base token safety check ($0.02/call via x402). " +
    "Verdict + 0-100 score with liquidity, holder and honeypot/mint facts cited.",
  actions: [checkTokenAction],
  evaluators: [],
  providers: [],
} as Plugin;

export default tokenVerdictPlugin;
