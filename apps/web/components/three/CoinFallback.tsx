// Flat coin shown while three.js loads, and kept when WebGL is unavailable.
export function CoinFallback() {
  return (
    <svg viewBox="0 0 200 200" width="100%" aria-hidden="true">
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="#EBE7E7"
        stroke="#0A0A0A"
        strokeWidth="3"
      />
      <circle
        cx="100"
        cy="100"
        r="76"
        fill="none"
        stroke="#6D001A"
        strokeDasharray="2 6"
        strokeWidth="4"
      />
      <rect
        x="66"
        y="66"
        width="68"
        height="68"
        fill="#0A0A0A"
        stroke="#6D001A"
        strokeWidth="2"
      />
      <rect x="82" y="82" width="36" height="36" fill="#6D001A" />
    </svg>
  );
}
