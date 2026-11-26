export const SPLASH_ID = "splash";

// Runs while the HTML is parsed, before the first paint, so a reload in the same tab does not
// show the splash again. Blocked storage throws here and the splash then plays on every load.
export const SPLASH_SCRIPT = `{if(sessionStorage.getItem("siliqua-splash"))document.getElementById("${SPLASH_ID}").hidden=true;else sessionStorage.setItem("siliqua-splash","1")}`;
