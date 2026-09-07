import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, errorMessage, setCSRFToken } from "../../api/client";
import type { Meta, Session } from "../../api/types";
import { Button, CheckboxField, TextField } from "../../components/ui";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { CurrencyField } from "../../components/CurrencyField";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";

type AuthResult = { authenticated: true; expiresAt: string; csrfToken: string };

function Brand() {
  return (
    <div className={styles.brand}>
      <img
        className={styles.brandMark}
        src="/icons/pwa-192x192.png"
        alt=""
        width="42"
        height="42"
        aria-hidden="true"
      />
      <span className={styles.brandName}>SIMFIMENT</span>
    </div>
  );
}

export function SetupPage({ meta }: { meta: Meta }) {
  const { locale, messages } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currencyCode, setCurrencyCode] = useState("TWD");
  const [location, setLocation] = useState(false);
  const [localError, setLocalError] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api.post("/api/v1/setup", {
        password,
        timezone: "Asia/Taipei",
        locale,
        currencyCode,
        automaticLocationEnabled: location,
      }) as Promise<AuthResult>,
    onSuccess: async (result) => {
      setCSRFToken(result.csrfToken);
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/entry", { replace: true });
    },
  });
  if (meta.initialized) return <Navigate to="/login" replace />;
  function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError("");
    if (password !== confirm) {
      setLocalError(messages.auth.passwordMismatch);
      return;
    }
    mutation.mutate();
  }
  const fields = mutation.error instanceof ApiError ? mutation.error.fields : {};
  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <LanguageSwitcher className={styles.authLanguage} />
        <div className={styles.authIntro}>
          <Brand />
          <p className={styles.eyebrow}>{messages.auth.firstSetup}</p>
          <h1>{messages.auth.createLedger}</h1>
          <p>{messages.auth.setupIntro}</p>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <TextField
            label={messages.auth.password}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
            minLength={12}
            maxLength={128}
            required
            supportingText={messages.auth.passwordHint}
            error={fields.password}
          />
          <TextField
            label={messages.auth.confirmPassword}
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
          <CurrencyField
            currencies={meta.currencies}
            value={currencyCode}
            onValueChange={setCurrencyCode}
            error={fields.currencyCode}
            disabled={mutation.isPending}
          />
          <CheckboxField
            checked={location}
            onCheckedChange={setLocation}
            label={messages.auth.automaticLocation}
            description={messages.auth.automaticLocationDescription}
          />
          {localError || mutation.error ? (
            <p className={styles.formError}>{localError || errorMessage(mutation.error)}</p>
          ) : null}
          <Button fullWidth size="large" type="submit" loading={mutation.isPending}>
            {messages.auth.finishSetup}
          </Button>
        </form>
      </section>
    </main>
  );
}

export function LoginPage({ session }: { session?: Session }) {
  const { messages } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.post("/api/v1/session", { password }) as Promise<AuthResult>,
    onSuccess: async (result) => {
      setCSRFToken(result.csrfToken);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/entry", { replace: true });
    },
  });
  if (session?.authenticated) return <Navigate to="/entry" replace />;
  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <LanguageSwitcher className={styles.authLanguage} />
        <div className={styles.authIntro}>
          <Brand />
          <p className={styles.eyebrow}>{messages.auth.welcomeBack}</p>
          <h1>{messages.auth.loginTitle}</h1>
          <p>{messages.auth.loginIntro}</p>
        </div>
        {searchParams.get("restored") === "1" ? (
          <div className={styles.successNote} role="status">
            {messages.auth.restoreComplete}
          </div>
        ) : null}
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <TextField
            label={messages.auth.password}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
          {mutation.error ? (
            <p className={styles.formError}>{errorMessage(mutation.error)}</p>
          ) : null}
          <Button
            fullWidth
            size="large"
            type="submit"
            loading={mutation.isPending}
            disabled={!password}
          >
            {messages.auth.login}
          </Button>
        </form>
      </section>
    </main>
  );
}
