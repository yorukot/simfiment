import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, onUnauthorized, setCSRFToken } from "../api/client";
import type { Meta, Session } from "../api/types";
import { ErrorState, PageLoading } from "../components/States";
import { AppShell } from "./AppShell";
import { LoginPage, SetupPage } from "../features/auth/AuthPages";
import { applyTheme } from "./theme";
import { clearStartupSnapshot } from "./startupSnapshot";

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [forcedUnauthenticated, setForcedUnauthenticated] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const metaQuery = useQuery({
    queryKey: ["meta"],
    queryFn: ({ signal }) => api.get<Meta>("/api/v1/meta", signal),
    staleTime: Infinity,
    refetchOnMount: "always",
  });
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => api.get<Session>("/api/v1/session", signal),
    enabled: metaQuery.data?.initialized === true,
    retry: false,
    refetchOnMount: "always",
  });
  const unauthenticated =
    forcedUnauthenticated ||
    (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401);
  useEffect(() => {
    if (!sessionQuery.data?.csrfToken) return;
    setCSRFToken(sessionQuery.data.csrfToken);
    setForcedUnauthenticated(false);
  }, [sessionQuery.data]);
  useEffect(
    () =>
      onUnauthorized(() => {
        clearStartupSnapshot();
        setCSRFToken("");
        setForcedUnauthenticated(true);
        if (location.pathname !== "/login") navigate("/login", { replace: true });
      }),
    [location.pathname, navigate],
  );
  useEffect(() => {
    if (metaQuery.data && !metaQuery.data.initialized) clearStartupSnapshot();
  }, [metaQuery.data]);
  useEffect(() => {
    if (!unauthenticated) return;
    clearStartupSnapshot();
    setCSRFToken("");
  }, [unauthenticated]);
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
  const sessionNeedsVerification = sessionQuery.data?.csrfToken === "";
  useEffect(() => {
    if (!sessionNeedsVerification || sessionQuery.error) {
      setShowVerification(false);
      return;
    }
    const timeout = window.setTimeout(() => setShowVerification(true), 500);
    return () => window.clearTimeout(timeout);
  }, [sessionNeedsVerification, sessionQuery.error]);

  if (metaQuery.isPending)
    return (
      <main className="app-bootstrap">
        <PageLoading />
      </main>
    );
  if (metaQuery.isError && !metaQuery.data)
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
  if (unauthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (sessionQuery.isError && !sessionQuery.data)
    return (
      <main className="app-bootstrap">
        <ErrorState error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} />
      </main>
    );
  if (!sessionQuery.data) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  const retryBootstrap = async () => {
    await Promise.allSettled([metaQuery.refetch(), sessionQuery.refetch()]);
    await Promise.allSettled([
      queryClient.refetchQueries({ queryKey: ["dashboard"] }),
      queryClient.refetchQueries({ queryKey: ["transactions"] }),
    ]);
  };
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/today" replace />} />
      <Route
        path="/*"
        element={
          <AppShell
            session={sessionQuery.data}
            meta={meta}
            bootstrap={{
              readOnly: sessionNeedsVerification,
              showPending: sessionNeedsVerification && showVerification,
              error: sessionNeedsVerification ? sessionQuery.error : undefined,
              onRetry: retryBootstrap,
            }}
          />
        }
      />
    </Routes>
  );
}
