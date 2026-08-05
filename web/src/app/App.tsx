import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, onUnauthorized, setCSRFToken } from "../api/client";
import type { Meta, Session } from "../api/types";
import { ErrorState, PageLoading } from "../components/States";
import { AppShell } from "./AppShell";
import { LoginPage, SetupPage } from "../features/auth/AuthPages";
import { applyTheme } from "./theme";

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const metaQuery = useQuery({
    queryKey: ["meta"],
    queryFn: ({ signal }) => api.get<Meta>("/api/v1/meta", signal),
    staleTime: Infinity,
  });
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => api.get<Session>("/api/v1/session", signal),
    enabled: metaQuery.data?.initialized === true,
    retry: false,
  });
  useEffect(() => {
    if (sessionQuery.data?.csrfToken) setCSRFToken(sessionQuery.data.csrfToken);
  }, [sessionQuery.data]);
  useEffect(
    () =>
      onUnauthorized(() => {
        if (location.pathname !== "/login") navigate("/login", { replace: true });
      }),
    [location.pathname, navigate],
  );
  useEffect(() => {
    const theme = sessionQuery.data?.settings.theme;
    if (!theme) return;
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("system");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [sessionQuery.data?.settings.theme]);

  if (metaQuery.isPending)
    return (
      <main className="app-bootstrap">
        <PageLoading />
      </main>
    );
  if (metaQuery.isError)
    return (
      <main className="app-bootstrap">
        <ErrorState error={metaQuery.error} onRetry={() => void metaQuery.refetch()} />
      </main>
    );
  const meta = metaQuery.data;
  if (!meta.initialized) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage meta={meta} />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }
  if (sessionQuery.isPending)
    return (
      <main className="app-bootstrap">
        <PageLoading />
      </main>
    );
  const unauthenticated =
    sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401;
  if (sessionQuery.isError && !unauthenticated)
    return (
      <main className="app-bootstrap">
        <ErrorState error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} />
      </main>
    );
  if (!sessionQuery.data || unauthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/today" replace />} />
      <Route path="/*" element={<AppShell session={sessionQuery.data} meta={meta} />} />
    </Routes>
  );
}
