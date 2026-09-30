import { RigSprite } from "@darthsaul/outerworld-ai-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.js";
import { DaemonProvider } from "./daemon-context.js";
import { readToken } from "./lib/api.js";
import { MissingToken } from "./pages/MissingToken.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");
const token = readToken(document);
const queryClient = new QueryClient();

createRoot(root).render(
  <StrictMode>
    <RigSprite />
    {token ? (
      <QueryClientProvider client={queryClient}>
        <DaemonProvider token={token}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DaemonProvider>
      </QueryClientProvider>
    ) : (
      <MissingToken />
    )}
  </StrictMode>,
);
