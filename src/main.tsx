import "@fontsource-variable/shantell-sans/full.css";
import "@fontsource-variable/atkinson-hyperlegible-next";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
