import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { startJournal } from "./data/journal";
import { startLiveCatalog } from "./state/live-catalog";
import { startSync } from "./state/sync";

// hydrate the stores from the API and persist every admin edit
startSync();
startLiveCatalog();
startJournal();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
