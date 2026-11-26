// Flat coin shown while three.js loads, and kept when WebGL is unavailable.
export function CoinFallback() {
  return (
    <svg viewBox="0 0 200 200" width="100%" aria-hidden="true">
      <defs>
        <linearGradient id="coin-satin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.6" stopColor="#E9E9E9" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <linearGradient id="coin-wine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#80102B" />
          <stop offset="1" stopColor="#3A000D" />
        </linearGradient>
      </defs>
      <polygon
        points="54,20 146,20 192,100 146,180 54,180 8,100"
        fill="url(#coin-satin)"
        stroke="#D0D0D0"
      />
      <polygon
        points="66,42 134,42 168,100 134,158 66,158 32,100"
        fill="url(#coin-wine)"
      />
      <circle
        cx="100"
        cy="100"
        r="44"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.7"
        strokeDasharray="1 4"
        strokeWidth="3"
      />
      <circle
        cx="100"
        cy="100"
        r="30"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="0.8"
      />
      <rect x="92" y="92" width="16" height="16" fill="#fff" />
    </svg>
  );
}
