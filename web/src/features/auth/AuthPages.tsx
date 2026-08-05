import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { api, ApiError, errorMessage, setCSRFToken } from "../../api/client";
import type { Meta, Session } from "../../api/types";
import { Button, CheckboxField, TextField } from "../../components/ui";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [location, setLocation] = useState(false);
  const [localError, setLocalError] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api.post("/api/v1/setup", {
        password,
        timezone: "Asia/Taipei",
        locale: "zh-TW",
        currencyCode: "TWD",
        automaticLocationEnabled: location,
      }) as Promise<AuthResult>,
    onSuccess: async (result) => {
      setCSRFToken(result.csrfToken);
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/today", { replace: true });
    },
  });
  if (meta.initialized) return <Navigate to="/login" replace />;
  function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError("");
    if (password !== confirm) {
      setLocalError("兩次輸入的密碼不同。 ");
      return;
    }
    mutation.mutate();
  }
  const fields = mutation.error instanceof ApiError ? mutation.error.fields : {};
  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <div className={styles.authIntro}>
          <Brand />
          <p className={styles.eyebrow}>第一次設定</p>
          <h1>建立你的私人帳本</h1>
          <p>設定唯一的登入密碼即可開始使用。</p>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <TextField
            label="密碼"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
            minLength={12}
            maxLength={128}
            required
            supportingText="至少 12 個字元；可使用空格與中文。"
            error={fields.password}
          />
          <TextField
            label="確認密碼"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
          <CheckboxField
            checked={location}
            onCheckedChange={setLocation}
            label="自動附上輸入位置"
            description="開啟記帳表單時才會向瀏覽器要求目前座標；儲存永遠不會等待位置。"
          />
          {localError || mutation.error ? (
            <p className={styles.formError}>{localError || errorMessage(mutation.error)}</p>
          ) : null}
          <Button fullWidth size="large" type="submit" loading={mutation.isPending}>
            完成設定
          </Button>
        </form>
      </section>
    </main>
  );
}

export function LoginPage({ session }: { session?: Session }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.post("/api/v1/session", { password }) as Promise<AuthResult>,
    onSuccess: async (result) => {
      setCSRFToken(result.csrfToken);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/today", { replace: true });
    },
  });
  if (session?.authenticated) return <Navigate to="/today" replace />;
  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <div className={styles.authIntro}>
          <Brand />
          <p className={styles.eyebrow}>歡迎回來</p>
          <h1>登入 Simfiment</h1>
          <p>你的資料只保存在這個 Simfiment 安裝環境中。</p>
        </div>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <TextField
            label="密碼"
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
            登入
          </Button>
        </form>
      </section>
    </main>
  );
}
