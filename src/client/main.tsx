import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Capture before React handles an action; portals share the same document-level motion policy.
// Keyboard actions (including Escape during an entrance) settle immediately. Pointer actions opt back in.
document.addEventListener("keydown", () => { document.documentElement.dataset.motionInput = "keyboard"; }, true);
document.addEventListener("pointerdown", () => { document.documentElement.dataset.motionInput = "pointer"; }, true);

// When the OS flips light/dark, every colour transition would fire at once and smear the switch.
// Hold transitions off for that frame (styles.css: [data-theme-switch]).
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const root = document.documentElement;
  root.dataset.themeSwitch = "";
  void root.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitch));
});

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
