import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// When the OS flips light/dark, every colour transition would fire at once and smear the switch.
// Hold transitions off for that frame (styles.css: [data-theme-switch]).
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const root = document.documentElement;
  root.dataset.themeSwitch = "";
  void root.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitch));
});

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
