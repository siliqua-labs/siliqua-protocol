import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "../../components/primitives";
import ui from "../../components/ui.module.css";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How to read the Siliqua indexes, trade a testnet market and verify an oracle value.",
};

const REPO = "https://github.com/siliqua-labs/siliqua-protocol";

const SECTIONS = [
  ["indexes", "The two indexes"],
  ["market", "Use a market"],
  ["settlement", "Settlement and refunds"],
  ["api", "Read from HTTP"],
  ["contract", "Read from a contract"],
  ["verify", "Verify a value"],
  ["source", "Source documents"],
] as const;

export default function DocsPage() {
  return (
    <div className={`${ui.page} ${ui.doc}`}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> DOCS
      </p>
      <h1>
        Documentation<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        How to read the indexes, use a market and check the numbers yourself.
      </p>
      <Notice>
        Siliqua runs on Robinhood Chain Testnet (chain ID 46630). Test tokens
        have no value. The contracts are not audited and mainnet is not
        deployed.
      </Notice>

      <nav aria-label="On this page" className={ui.toc}>
        {SECTIONS.map(([id, title]) => (
          <a key={id} href={`#${id}`}>
            {title}
          </a>
        ))}
      </nav>

      <h3 id="indexes">The two indexes</h3>
      <ul className={ui.list}>
        <li>
          <b>GRI, GPU Rent Index.</b> On-demand rent of one GPU for one hour, in
          USD, with 6 decimals. One value per hour for each of H100 80GB SXM,
          H200 SXM, B200, A100 80GB and RTX 4090 24GB. Signed values are stored
          on chain.
        </li>
        <li>
          <b>CMI, Compute Mindshare Index.</b> The share of weighted social
          attention of each compute narrative, from 0 to 10,000 basis points.
          Computed daily and served by the API. It is not published on chain.
        </li>
      </ul>
      <p>
        An hour or a day that does not meet the rules is not published. It is
        shown as stale, and no older value is presented as live. Full rules:{" "}
        <Link href="/methodology">Methodology</Link>.
      </p>

      <h3 id="market">Use a market</h3>
      <p>
        A market asks whether the 24-hour average (TWAP) of one GRI index ends
        above a threshold. You buy YES or NO into a shared pool.
      </p>
      <ol className={ui.list}>
        <li>
          Install a browser wallet. Connect it with the button in the header and
          accept the switch to Robinhood Chain Testnet.
        </li>
        <li>
          Get a little testnet ETH for gas from the{" "}
          <a href="https://faucet.testnet.chain.robinhood.com/">
            Robinhood Chain faucet
          </a>
          .
        </li>
        <li>
          Open a market on <Link href="/markets">Markets</Link>. In the ticket,
          use the button that gives free test tUSDG if your balance is empty.
        </li>
        <li>
          Choose YES or NO, enter an amount and buy. A first buy asks for two
          wallet confirmations: approve the exact amount, then buy.
        </li>
        <li>
          After settlement, claim your payout on the market page or in{" "}
          <Link href="/portfolio">Portfolio</Link>.
        </li>
      </ol>
      <p>
        Each address has a cap per market across both sides (1,000 tUSDG in the
        current template). The estimated payout in the ticket changes as the
        pools change. The final payout is known only at settlement.
      </p>

      <h3 id="settlement">Settlement and refunds</h3>
      <ul className={ui.list}>
        <li>
          Buying closes 24 hours before the 24-hour TWAP window starts. Anyone
          can settle from 3 hours after the window ends.
        </li>
        <li>TWAP above the threshold is YES. Equal to the threshold is NO.</li>
        <li>
          The fee is 2% of the losing pool, taken at settlement. Winners share
          the rest in proportion to their stake.
        </li>
        <li>
          If more than 6 hours of the window have no published value, the market
          is void and every stake is returned.
        </li>
        <li>
          If the winning side has no stake, the market is void. If the losing
          side has no stake, winners get their stake back. Neither case takes a
          fee.
        </li>
        <li>
          If nobody settles within 14 days of the settle time, any holder can
          take a refund.
        </li>
        <li>A pause stops buying only. It never blocks a claim or a refund.</li>
      </ul>

      <h3 id="api">Read from HTTP</h3>
      <p>
        The API is read-only and open to any origin, limited to 60 requests per
        minute per IP. <code>GET /v1/indexes</code> lists every index with its
        latest value and status. <code>GET /v1/oracle</code> shows operator
        values and rejected reports.
      </p>

      <h3 id="contract">Read from a contract</h3>
      <p>
        The index id is <code>keccak256</code> of its name, for example{" "}
        <code>keccak256(&quot;GRI-H100&quot;)</code>. GRI values are micro-USD
        per GPU-hour.
      </p>
      <pre className={ui.code}>
        <code>{`latest(indexId)                 // newest finalized slot: (slotStart, value)
getSlot(indexId, timestamp)     // one slot, check "finalized" first
twap(indexId, from, to)         // (value, usedSlots, staleSlots)`}</code>
      </pre>
      <p style={{ marginTop: 16 }}>
        A slot without a finalized value is stale, so set your own staleness
        limit. A new oracle version is a new address, not an upgrade. Contract
        address: <Link href="/oracle">Oracle</Link>. A consumer example is in{" "}
        <a
          href={`${REPO}/blob/main/contracts/src/examples/GpuRentConsumer.sol`}
        >
          GpuRentConsumer.sol
        </a>
        .
      </p>

      <h3 id="verify">Verify a value</h3>
      <ol className={ui.list}>
        <li>
          Read the slot with <code>getSlot</code>.
        </li>
        <li>
          Compare the <code>OperatorValue</code> events of that slot. They list
          every operator value and whether it was counted.
        </li>
        <li>
          To recompute hours, the repository has scripts that export a month of
          inputs and <code>verify</code> it with the same package version,
          without a database.
        </li>
      </ol>
      <p style={{ marginTop: 16 }}>
        Raw data can be downloaded only for sources whose terms allow it. For
        other sources only aggregated values and input hashes are published, so
        you cannot recompute those hours from public data alone.
      </p>

      <h3 id="source">Source documents</h3>
      <ul className={`${ui.list} ${ui.links}`}>
        <li>
          <Link href="/whitepaper">Whitepaper</Link> and{" "}
          <Link href="/faq">FAQ</Link>
        </li>
        <li>
          <a href={`${REPO}/blob/main/docs/spec/oracle-v1.md`}>
            Oracle specification
          </a>
        </li>
        <li>
          <a href={`${REPO}/blob/main/docs/spec/market-v1.md`}>
            Market specification
          </a>
        </li>
        <li>
          <a href={`${REPO}/blob/main/contracts/announcement.md`}>
            Testnet contract addresses and trust boundaries
          </a>
        </li>
      </ul>
    </div>
  );
}
