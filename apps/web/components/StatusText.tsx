import { splitStatusLink } from "../lib/statusLink";

/** A status line; a transaction URL at its end becomes a short link that opens in a new tab. */
export function StatusText({ status }: { status: string }) {
  const { text, url } = splitStatusLink(status);
  return (
    <>
      {text}
      {url ? (
        <>
          {text ? " " : ""}
          <a href={url} target="_blank" rel="noopener noreferrer">
            View transaction ↗
          </a>
        </>
      ) : null}
    </>
  );
}
