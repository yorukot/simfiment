import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, errorMessage, setCSRFToken } from "../../api/client";
import type { Category, Kind, Meta, OperationsStatus, Session, Settings } from "../../api/types";
import { ErrorState, PageLoading } from "../../components/States";
import { useToast } from "../../components/Toast/ToastProvider";
import styles from "../../styles/ui.module.css";

const iconOptions = [
  ["", "無圖示"], ["food", "飲食"], ["transport", "交通"], ["shopping", "購物"],
  ["home", "居家"], ["entertainment", "娛樂"], ["health", "健康"], ["education", "教育"],
  ["subscription", "訂閱"], ["salary", "薪資"], ["bonus", "獎金"], ["freelance", "接案"],
  ["interest", "利息"], ["refund", "退款"], ["gift", "禮物"], ["travel", "旅行"],
  ["pets", "寵物"], ["utilities", "水電瓦斯"], ["other", "其他"],
] as const;

export function SettingsPage({ settings, meta }: { settings: Settings; meta: Meta }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [timezoneDraft, setTimezoneDraft] = useState(settings.timezone);
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const expense = useQuery({ queryKey: ["categories", "expense", "all"], queryFn: ({ signal }) => api.get<Category[]>("/api/v1/categories?kind=expense&includeArchived=true", signal) });
  const income = useQuery({ queryKey: ["categories", "income", "all"], queryFn: ({ signal }) => api.get<Category[]>("/api/v1/categories?kind=income&includeArchived=true", signal) });
  const operations = useQuery({ queryKey: ["operations-status"], queryFn: ({ signal }) => api.get<OperationsStatus>("/api/v1/operations/status", signal) });
  const refreshSession = async () => {
    const session = await api.get<Session>("/api/v1/session");
    setCSRFToken(session.csrfToken);
    queryClient.setQueryData(["session"], session);
  };
  const patchSettings = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch<Record<string, unknown>, Settings>("/api/v1/settings", body), onSuccess: async () => { await refreshSession(); showToast({ message: "設定已更新。" }); } });
  const password = useMutation({ mutationFn: () => api.put("/api/v1/password", { currentPassword, newPassword }), onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); showToast({ message: "密碼已變更，其他登入階段已撤銷。" }); } });
  const logout = useMutation({ mutationFn: () => api.delete("/api/v1/session"), onSuccess: async () => { await queryClient.clear(); navigate("/login", { replace: true }); } });
  const revoke = useMutation({ mutationFn: () => api.post("/api/v1/sessions/revoke-others", {}), onSuccess: () => showToast({ message: "其他登入階段已撤銷。" }) });
  if (expense.isPending || income.isPending) return <PageLoading />;
  if (expense.isError) return <ErrorState error={expense.error} onRetry={() => void expense.refetch()} />;
  if (income.isError) return <ErrorState error={income.error} onRetry={() => void income.refetch()} />;
  function submitPassword(event: FormEvent) {
    event.preventDefault(); setPasswordError("");
    if (newPassword !== confirmPassword) { setPasswordError("兩次輸入的新密碼不同。"); return; }
    password.mutate();
  }
  return <>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>偏好與安全</p><h1>設定</h1><p>管理分類、位置、外觀與登入密碼。</p></div></header>
    {patchSettings.error || logout.error || revoke.error || operations.error ? <p className={styles.formError}>{errorMessage(patchSettings.error || logout.error || revoke.error || operations.error)}</p> : null}
    <div className={styles.settingsGrid}>
      <section className={styles.settingCard}><h2>外觀</h2><p>選擇跟隨裝置或固定明暗主題。</p><select className={styles.select} aria-label="外觀主題" value={settings.theme} onChange={(event) => patchSettings.mutate({ theme: event.target.value })}><option value="system">跟隨系統</option><option value="light">淺色</option><option value="dark">深色</option></select></section>
      <section className={styles.settingCard}><h2>輸入位置</h2><p>座標只保存在 Simfiment，不會送往第三方；交易儲存不會等待位置。</p><label className={styles.checkRow}><input type="checkbox" checked={settings.automaticLocationEnabled} onChange={(event) => patchSettings.mutate({ automaticLocationEnabled: event.target.checked })} /><span><strong>新交易自動嘗試附上位置</strong></span></label></section>
      <section className={`${styles.settingCard} ${styles.settingWide}`}><h2>分類</h2><p>封存後仍會保留歷史交易；每種類型至少保留一個啟用分類。</p><CategoryManager kind="expense" title="支出分類" items={expense.data} /><CategoryManager kind="income" title="收入分類" items={income.data} /></section>
      <section className={styles.settingCard}><h2>變更密碼</h2><p>完成後會自動撤銷其他裝置的登入階段。</p><form className={styles.form} onSubmit={submitPassword}><input className={styles.input} type="password" placeholder="目前密碼" aria-label="目前密碼" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><input className={styles.input} type="password" placeholder="新密碼（至少 12 字元）" aria-label="新密碼" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} required /><input className={styles.input} type="password" placeholder="再次輸入新密碼" aria-label="確認新密碼" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />{passwordError || password.error ? <p className={styles.formError}>{passwordError || errorMessage(password.error)}</p> : null}<button className={styles.secondaryButton} type="submit" disabled={password.isPending}>更新密碼</button></form></section>
      <section className={styles.settingCard}><h2>登入階段</h2><p>如果曾在其他裝置登入，可撤銷那些階段；目前裝置會保持登入。</p><div className={styles.actions}><button className={styles.secondaryButton} type="button" onClick={() => revoke.mutate()} disabled={revoke.isPending}>撤銷其他階段</button><button className={styles.dangerButton} type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>登出</button></div></section>
      <section className={styles.settingCard}><h2>時區、語系與幣別</h2><p>變更時區不會重新分組既有資料；新交易與編輯後的交易會使用新時區。</p><div className={styles.form}><label className={styles.field}><span className={styles.label}>IANA 時區</span><input className={styles.input} value={timezoneDraft} onChange={(event) => { setTimezoneDraft(event.target.value); setTimezoneConfirmed(false); }} /></label>{timezoneDraft !== settings.timezone ? <label className={styles.checkRow}><input type="checkbox" checked={timezoneConfirmed} onChange={(event) => setTimezoneConfirmed(event.target.checked)} /><span>我了解歷史日／月分組不會自動改變</span></label> : null}<button className={styles.secondaryButton} type="button" disabled={timezoneDraft === settings.timezone || !timezoneConfirmed || patchSettings.isPending} onClick={() => patchSettings.mutate({ timezone: timezoneDraft, confirmTimezoneChange: true })}>更新時區</button><span className={styles.hint}>介面語系：繁體中文（{settings.locale}）</span><span className={styles.hint}>安裝幣別：{settings.currencyCode}（MVP 不支援混用幣別）</span></div></section>
      <section className={styles.settingCard}><h2>系統狀態</h2><p>版本 {meta.version}<br />資料庫：{operations.data?.databaseHealthy ? "正常" : operations.isPending ? "檢查中" : "需要檢查"}<br />備份：{operations.data ? `${operations.data.backupCount} 份` : "檢查中"}<br />最近備份：{operations.data?.lastBackupAt ? new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(operations.data.lastBackupAt)) : "尚無"}</p><span className={styles.hint}>備份由伺服器執行 <code>simfiment backup create</code> 建立，介面不提供資料庫下載。</span></section>
    </div>
  </>;
}

function CategoryManager({ kind, title, items }: { kind: Kind; title: string; items: Category[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("");
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["categories", kind] }), queryClient.invalidateQueries({ queryKey: ["categories", kind, "all"] })]);
  const add = useMutation({ mutationFn: () => api.post("/api/v1/categories", { kind, name, iconKey }), onSuccess: async () => { setName(""); setIconKey(""); await refresh(); showToast({ message: "分類已建立。" }); } });
  const action = useMutation({ mutationFn: ({ item, action, name, nextIcon }: { item: Category; action: "archive" | "restore" | "update"; name?: string; nextIcon?: string }) => action === "update" ? api.patch(`/api/v1/categories/${item.id}`, { name: name ?? item.name, iconKey: nextIcon ?? item.iconKey }) : api.post(`/api/v1/categories/${item.id}/${action}`, {}), onSuccess: refresh });
  const active = items.filter((item) => !item.archivedAt);
  const reorder = useMutation({ mutationFn: (orderedIds: number[]) => api.put("/api/v1/categories/order", { kind, orderedIds }), onSuccess: refresh });
  function move(item: Category, direction: -1 | 1) {
    const index = active.findIndex((value) => value.id === item.id);
    const target = index + direction;
    if (target < 0 || target >= active.length) return;
    const next = active.map((value) => value.id);
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate(next);
  }
  return <div className={styles.section}><div className={styles.sectionTitle}><h3>{title}</h3><span className={styles.countPill}>{active.length} 個啟用</span></div><div>{items.map((item) => <div key={item.id} className={styles.categoryManageRow}><div className={styles.rowGrow}><strong>{item.name}</strong><small>{item.archivedAt ? "已封存" : "啟用中"}</small></div><div className={styles.actions}>{!item.archivedAt ? <><select className={styles.compactSelect} aria-label={`${item.name} 圖示`} value={item.iconKey} onChange={(event) => action.mutate({ item, action: "update", nextIcon: event.target.value })}>{iconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className={styles.iconButton} type="button" aria-label={`上移 ${item.name}`} onClick={() => move(item, -1)}>↑</button><button className={styles.iconButton} type="button" aria-label={`下移 ${item.name}`} onClick={() => move(item, 1)}>↓</button><button className={styles.textButton} type="button" onClick={() => { const value = window.prompt("新的分類名稱", item.name); if (value) action.mutate({ item, action: "update", name: value }); }}>重新命名</button><button className={styles.textButton} type="button" onClick={() => action.mutate({ item, action: "archive" })}>封存</button></> : <button className={styles.textButton} type="button" onClick={() => action.mutate({ item, action: "restore" })}>還原</button>}</div></div>)}</div><div className={styles.inlineForm} style={{ marginTop: 12 }}><input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} maxLength={30} placeholder={`新增${title}`} aria-label={`新增${title}名稱`} /><select className={styles.compactSelect} aria-label={`新增${title}圖示`} value={iconKey} onChange={(event) => setIconKey(event.target.value)}>{iconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className={styles.secondaryButton} type="button" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>新增</button></div>{add.error || action.error || reorder.error ? <p className={styles.fieldError}>{errorMessage(add.error || action.error || reorder.error)}</p> : null}</div>;
}
