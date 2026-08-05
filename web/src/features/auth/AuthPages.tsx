import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { api, ApiError, errorMessage, setCSRFToken } from "../../api/client";
import type { Meta, Session } from "../../api/types";
import styles from "../../styles/ui.module.css";

type AuthResult = { authenticated: true; expiresAt: string; csrfToken: string };

function Brand() {
  return <div className={styles.brand}><span className={styles.brandMark}>S</span><span>Simfiment</span></div>;
}

export function SetupPage({ meta }: { meta: Meta }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [location, setLocation] = useState(false);
  const [localError, setLocalError] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.post("/api/v1/setup", {
      setupCode,
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
          <p>輸入伺服器啟動時顯示的一次性設定碼，接著設定唯一的登入密碼。</p>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.label}>一次性設定碼</span>
            <input className={styles.input} value={setupCode} onChange={(event) => setSetupCode(event.target.value)} autoComplete="one-time-code" required />
            {fields.setupCode ? <span className={styles.fieldError}>{fields.setupCode}</span> : null}
          </label>
          <label className={styles.field}>
            <span className={styles.label}>新密碼</span>
            <input className={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required />
            <span className={styles.hint}>至少 12 個字元；可使用空格與中文。</span>
            {fields.password ? <span className={styles.fieldError}>{fields.password}</span> : null}
          </label>
          <label className={styles.field}>
            <span className={styles.label}>確認密碼</span>
            <input className={styles.input} type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={location} onChange={(event) => setLocation(event.target.checked)} />
            <span><strong>自動附上輸入位置</strong><br /><span className={styles.hint}>開啟記帳表單時才會向瀏覽器要求目前座標；儲存永遠不會等待位置。</span></span>
          </label>
          {localError || mutation.error ? <p className={styles.formError}>{localError || errorMessage(mutation.error)}</p> : null}
          <button className={`${styles.primaryButton} ${styles.fullButton}`} type="submit" disabled={mutation.isPending}>{mutation.isPending ? "正在建立…" : "完成設定"}</button>
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
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <label className={styles.field}>
            <span className={styles.label}>密碼</span>
            <input className={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus required />
          </label>
          {mutation.error ? <p className={styles.formError}>{errorMessage(mutation.error)}</p> : null}
          <button className={`${styles.primaryButton} ${styles.fullButton}`} type="submit" disabled={mutation.isPending || !password}>{mutation.isPending ? "登入中…" : "登入"}</button>
        </form>
      </section>
    </main>
  );
}

