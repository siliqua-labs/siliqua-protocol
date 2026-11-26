import { SPLASH_ID, SPLASH_SCRIPT } from "../lib/splash";
import { Logo } from "./Logo";
import styles from "./SplashScreen.module.css";

// Rendered by the root layout, so client-side navigation never replays it. CSS alone removes it,
// which keeps a slow or failed script from trapping the page behind it.
export function SplashScreen() {
  return (
    <>
      <div
        id={SPLASH_ID}
        className={styles.splash}
        aria-hidden="true"
        // The inline script may set "hidden" before React hydrates.
        suppressHydrationWarning
      >
        <Logo height={112} />
        <span className={styles.name}>SILIQUA</span>
        <span className={styles.bar} />
      </div>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant from our own code that must run before the first paint
        dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }}
      />
    </>
  );
}
