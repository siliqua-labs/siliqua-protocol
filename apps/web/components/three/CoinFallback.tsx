// Flat coin shown while three.js loads, and kept when WebGL is unavailable.
export function CoinFallback() {
  return (
    <svg viewBox="0 0 200 200" width="100%" aria-hidden="true">
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="#8d8a85"
        stroke="#D8D4CC"
        strokeWidth="3"
      />
      <circle
        cx="100"
        cy="100"
        r="76"
        fill="none"
        stroke="#55524e"
        strokeDasharray="2 6"
        strokeWidth="4"
      />
      <rect
        x="66"
        y="66"
        width="68"
        height="68"
        fill="#2b2a28"
        stroke="#E0662B"
        strokeWidth="2"
      />
      <rect x="82" y="82" width="36" height="36" fill="#5c5954" />
    </svg>
  );
}
