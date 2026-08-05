import "./app/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { queryClient } from "./app/queryClient";
import { ToastProvider } from "./components/Toast/ToastProvider";
import { UIProvider } from "./components/ui";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UIProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </UIProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
