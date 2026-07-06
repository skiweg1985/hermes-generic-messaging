import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Basis-Styles müssen VOR dem App-Import stehen: ES-Module führen den App-Graphen
// (inkl. premium.css) sonst zuerst aus, und premium.css muss als letztes Stylesheet
// laden (siehe scripts/check-premium-cascade.mjs).
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/typography.css";
import "./styles/motion.css";
import "./styles/transcript.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
