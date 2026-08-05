import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, onUnauthorized, setCSRFToken } from "../api/client";
import type { Meta, Session } from "../api/types";
import { ErrorState, PageLoading } from "../components/States";
import { AppShell } from "./AppShell";
import { LoginPage, SetupPage } from "../features/auth/AuthPages";

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const metaQuery = useQuery({ queryKey: ["meta"], queryFn: ({ signal }) => api.get<Meta>("/api/v1/meta", signal), staleTime: Infinity });
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => api.get<Session>("/api/v1/session", signal),
    enabled: metaQuery.data?.initialized === true,
    retry: false,
  });
  useEffect(() => {
    if (sessionQuery.data?.csrfToken) setCSRFToken(sessionQuery.data.csrfToken);
  }, [sessionQuery.data]);
  useEffect(() => onUnauthorized(() => {
    if (location.pathname !== "/login") navigate("/login", { replace: true });
  }), [location.pathname, navigate]);
  useEffect(() => {
    const theme = sessionQuery.data?.settings.theme;
    const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
    document.documentElement.dataset.theme = resolved ?? "light";
  }, [sessionQuery.data?.settings.theme]);

  if (metaQuery.isPending) return <main style={{ padding: 24 }}><PageLoading /></main>;
  if (metaQuery.isError) return <main style={{ padding: 24 }}><ErrorState error={metaQuery.error} onRetry={() => void metaQuery.refetch()} /></main>;
  const meta = metaQuery.data;
  if (!meta.initialized) {
    return <Routes><Route path="/setup" element={<SetupPage meta={meta} />} /><Route path="*" element={<Navigate to="/setup" replace />} /></Routes>;
  }
  if (sessionQuery.isPending) return <main style={{ padding: 24 }}><PageLoading /></main>;
  const unauthenticated = sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401;
  if (sessionQuery.isError && !unauthenticated) return <main style={{ padding: 24 }}><ErrorState error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} /></main>;
  if (!sessionQuery.data || unauthenticated) {
    return <Routes><Route path="/login" element={<LoginPage />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  }
  return <Routes><Route path="/login" element={<Navigate to="/today" replace />} /><Route path="/*" element={<AppShell session={sessionQuery.data} meta={meta} />} /></Routes>;
}
