# Token Verdict — integration snippets

**Add a $0.02 pre-trade token safety check to your agent in minutes.**

Token Verdict is a live x402 endpoint on Base:

```
POST https://crypto-intel-agent.vercel.app/api/token-verdict
Body: { "address": "0x<token contract>", "chain": "base" }
Price: $0.02/call, USDC on Base — no API key, pay per call via x402
```

You get back one verdict card:

```json
{
  "verdict": "clean | caution | rug_risk | exit_trap",
  "score": 85,
  "reasons": ["Liquidity is deep: $… across … pool(s) on Base.", "…"],
  "facts": { "liquidityUsd": 0, "top10HolderPct": 0, "isHoneypot": false }
}
```

Every score cites its facts — liquidity, holder concentration, and
honeypot / mint / tax flags — instead of a black-box number. A failed
check (HTTP 502, data sources down) is **never charged**.

## Pick your framework

| Folder | What it is |
|---|---|
| `plain/` | Framework-agnostic client (`token-verdict.mjs`). Works anywhere Node runs. Includes a free dry-run that prints the 402 price challenge without paying. |
| `agentkit/` | Coinbase AgentKit snippet (`token-verdict-agentkit.ts`). Uses AgentKit's built-in `x402ActionProvider` — whitelist the service, call `make_http_request_with_x402` before any swap, block the trade on `rug_risk` / `exit_trap`. |
| `elizaos/` | ElizaOS plugin (`plugin-token-verdict`). One action, `CHECK_TOKEN`: paste/mention a Base address and the character checks it before trading, then replies with the verdict and reasons. |

## The gate rule (all frameworks)

```
verdict = check(token)
if verdict in ["rug_risk", "exit_trap"]:  DO NOT TRADE
if verdict == "caution":                  trade small, or skip
if verdict == "clean":                    proceed
```

## Why agents add it

Trading bots call a check like this *before every trade* — that's the
loop. One integration means a $0.02 call every time your agent is
about to buy a token it hasn't verified. The cost of one rug is
orders of magnitude higher than the cost of the check.

## Notes for builders

- Wallet: any EVM wallet with a small USDC float on Base. Payments are
  gas-free for the payer (x402 exact scheme, CDP facilitator).
- Spend safety: cap the wallet float. In AgentKit,
  `make_http_request_with_x402` pays whatever a 402 asks, so the
  snippet whitelists this origin and sets `maxPaymentUsdc: 0.02`
  where the provider config supports it.
- Endpoint discovery: `/.well-known/x402`, OpenAPI and an A2A agent
  card are published at `https://crypto-intel-agent.vercel.app`.
- Listed: Coinbase Bazaar (cataloged), Agent402, x402dash,
  agent-tools.cloud #3249.

Questions / integration help: open an issue or reply to @FounderWilfred on X.
