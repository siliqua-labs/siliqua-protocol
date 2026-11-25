import Image from "next/image";

const RATIO = 292 / 360;

export function Logo({ height }: { height: number }) {
  return (
    <Image
      src="/siliqua-logo.png"
      alt=""
      aria-hidden="true"
      width={Math.round(height * RATIO)}
      height={height}
    />
  );
}
