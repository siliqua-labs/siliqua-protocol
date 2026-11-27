import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, Notice } from "../../components/primitives";
import ui from "../../components/ui.module.css";

export const metadata: Metadata = {
  title: "Whitepaper",
  description:
    "Design of the Siliqua GPU rent and compute narrative indexes, oracle and weekly market.",
};

const SECTIONS = [
  ["summary", "Summary"],
  ["problem", "Problem"],
  ["gri", "GPU Rent Index"],
  ["cmi", "Compute Mindshare Index"],
  ["oracle", "Oracle"],
  ["market", "Market"],
  ["fees", "Fees"],
  ["governance", "Administration"],
  ["limits", "Limitations and risks"],
  ["status", "Status"],
] as const;

export default function WhitepaperPage() {
  return (
    <div className={`${ui.page} ${ui.doc}`}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> WHITEPAPER
      </p>
      <h1>
        Siliqua<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        Open indexes of GPU rent and compute narratives, and a weekly prediction
        market on the rent index. Draft of 26 November 2026.
      </p>
      <Notice>
        Draft text. It describes a testnet system that is not audited and has
        not had legal review. It is not an offer, and not investment, legal or
        tax advice.
      </Notice>

      <nav aria-label="Contents" className={ui.toc}>
        {SECTIONS.map(([id, title]) => (
          <a key={id} href={`#${id}`}>
            {title}
          </a>
        ))}
      </nav>

      <h3 id="summary">Summary</h3>
      <p>
        Siliqua publishes two indexes. GRI measures what it costs to rent a GPU
        for one hour. CMI measures how social attention is split between compute
        narratives. Operators sign the hourly GRI and a contract on Robinhood
        Chain stores it. A parimutuel market settles on the 24-hour average of
        that value.
      </p>

      <h3 id="problem">Problem</h3>
      <p>
        GPU rent prices are spread over many provider pages, in different units
        and terms. A contract cannot read them, and a reader cannot check a
        single quoted market price. Siliqua applies one published rule set to
        those listings, records which version of the rules produced each value,
        and stores the result where contracts can read it.
      </p>

      <h3 id="gri">GPU Rent Index</h3>
      <p>
        The unit is USD per GPU-hour, stored as an integer number of micro-USD.
        One class is one SKU: H100 80GB SXM, H200 SXM, B200, A100 80GB and RTX
        4090 24GB. Only on-demand prices count. Spot, reserved and bid prices
        are excluded.
      </p>
      <ol className={ui.list}>
        <li>Collectors read each source every 10 minutes.</li>
        <li>
          Each source gives one quote per class and hour: the median of its
          observations in that hour. A marketplace counts as one source.
        </li>
        <li>
          With m the median of the quotes and MAD their median absolute
          deviation, quotes further from m than 3 × max(1.4826 × MAD, 1% of m)
          are dropped.
        </li>
        <li>
          At least 5 quotes must remain. Otherwise the class is not published
          for that hour.
        </li>
        <li>
          The value is the median of the remaining quotes. With an even number
          it is the mean of the two middle quotes, rounded half up. Every source
          has the same weight in version 1.0.
        </li>
      </ol>
      <p style={{ marginTop: 16 }}>
        The arithmetic uses integers only. The functions are pure: the same
        inputs and package version give the same value, and each hour stores a
        hash of its inputs.
      </p>

      <h3 id="cmi">Compute Mindshare Index</h3>
      <p>
        CMI is computed once per UTC day from public posts on Farcaster and
        Bluesky. A classifier gives each post one narrative: GPU supply,
        decentralized compute, AI inference, AI agents or data center power.
        Posts below the entry threshold count as OTHER. The narrative list is a
        proposal until the classifier has been evaluated.
      </p>
      <ul className={ui.list}>
        <li>
          A post is weighted by the credibility of its account (age, bot score
          and a maintained account list) and by a decay with a 48-hour half-life
          over a 7-day lookback.
        </li>
        <li>
          Shares are rounded by largest remainder, so they total exactly 10,000
          basis points.
        </li>
        <li>
          A day with too few platforms or zero total weight is not published.
        </li>
        <li>Post text is never published.</li>
      </ul>

      <h3 id="oracle">Oracle</h3>
      <p>
        Three operators each compute GRI and sign their own value with EIP-712.
        A relayer submits the signed reports. The contract drops values more
        than 1% from the median, needs at least 2 values left, and stores their
        median. With 2 values it stores the mean, rounded half up. Every
        operator value is emitted in an event, including dropped ones.
      </p>
      <p>
        A report is accepted for up to 3 hours after its hour ends. A finalized
        value cannot be rewritten or deleted.
      </p>

      <h3 id="market">Market</h3>
      <p>
        Each market asks whether the TWAP of one GRI index over a 24-hour window
        is above a threshold. Equal counts as NO. Buying closes 24 hours before
        the window starts, and anyone can settle 3 hours after it ends.
      </p>
      <p>
        Hours without a value are skipped. The market is void and fully refunded
        if they add up to more than 6 hours, if the winning side has no stake,
        or if it is still unsettled 14 days after the settle time. Winners
        receive their share of both pools after the fee, rounded down.
      </p>
      <p>
        Market contracts are immutable and keep the oracle address, token, fee
        and cap they were created with. No admin function can change or rescue a
        running market. This is deliberate.
      </p>

      <h3 id="fees">Fees</h3>
      <p>
        The fee is 2% of the losing pool, charged once at settlement. There is
        no fee on a void market or when the losing side is empty. A router
        contract splits collected fees between three fixed addresses and never
        swaps or burns.
      </p>
      <DataTable caption="Fee split">
        <thead>
          <tr>
            <th scope="col">Share</th>
            <th scope="col">Recipient</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>50%</td>
            <td>Buyback and burn wallet, operated by the treasury</td>
          </tr>
          <tr>
            <td>30%</td>
            <td>Treasury</td>
          </tr>
          <tr>
            <td>20%</td>
            <td>Oracle operators</td>
          </tr>
        </tbody>
      </DataTable>
      <p style={{ marginTop: 16 }}>
        Any buyback or burn is a manual treasury step. The contracts do not
        enforce it.
      </p>

      <h3 id="governance">Administration</h3>
      <p>
        On mainnet, the operator allowlist and the parameters are meant to be
        held by a 2 of 3 multisig behind a 1 hour timelock. The multisig can
        pause buying and remove an operator without that delay, and it can
        change the delay through the timelock. A change to the operator
        allowlist or to oracle parameters also applies to markets that are
        already running. Mainnet is not deployed; on testnet a single key holds
        the admin roles. A pause stops buying only and never blocks claims or
        refunds. Contracts are not upgradeable: a new version is a new
        deployment. A new methodology version needs 14 days of notice.
      </p>

      <h3 id="limits">Limitations and risks</h3>
      <ul className={ui.list}>
        <li>
          The three operators are one team. There is no stake and no slashing in
          version 1, and two operators together can set the value. This is trust
          in one team, not economic security.
        </li>
        <li>
          GRI uses listed prices, not executed trades. A listed price can differ
          from what a renter pays.
        </li>
        <li>
          Terms for storing and republishing price data are unresolved for
          several sources. A source can be removed, which can leave a class
          without a value.
        </li>
        <li>
          CMI labels cannot be reproduced by a third party, and coordinated
          posting is reduced but not prevented.
        </li>
        <li>
          The per-address cap and the operator betting ban can be bypassed with
          more addresses.
        </li>
        <li>Smart contracts can have bugs, and these have not been audited.</li>
        <li>Prediction markets may be restricted where you live.</li>
      </ul>

      <h3 id="status">Status</h3>
      <p>
        The indexes, oracle and markets run on Robinhood Chain Testnet (chain ID
        46630). A contract audit and a legal review are required before mainnet.
        Detail: <Link href="/methodology">Methodology</Link>,{" "}
        <Link href="/oracle">Oracle</Link>, <Link href="/docs">Docs</Link>.
      </p>
    </div>
  );
}
