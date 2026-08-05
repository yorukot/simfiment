import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../api/client";
import type { Category, Kind, RecurringOccurrence, RecurringPreview, RecurringRule, Settings } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { useToast } from "../../components/Toast/ToastProvider";
import { addDays, todayInTimezone, zonedLocalToISO } from "../../lib/date";
import styles from "../../styles/ui.module.css";

type RuleForm = { kind: Kind; amount: string; categoryId?: number; title: string; frequency: "weekly" | "monthly" | "yearly"; interval: string; startOn: string };
type OccurrenceForm = { amount: string; categoryId?: number; title: string; occurredAt: string };

export function RecurringPage({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const today = todayInTimezone(settings.timezone);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringRule>();
  const [editingOccurrence, setEditingOccurrence] = useState<RecurringOccurrence>();
  const [occurrenceForm, setOccurrenceForm] = useState<OccurrenceForm>({ amount: "", title: "", occurredAt: "" });
  const [form, setForm] = useState<RuleForm>({ kind: "expense", amount: "", title: "", frequency: "monthly", interval: "1", startOn: today });
  const rules = useQuery({ queryKey: ["recurring-rules"], queryFn: ({ signal }) => api.get<RecurringRule[]>("/api/v1/recurring-rules?includeArchived=false", signal) });
  const pending = useQuery({ queryKey: ["recurring-occurrences", "pending"], queryFn: ({ signal }) => api.get<RecurringOccurrence[]>("/api/v1/recurring-occurrences?status=pending", signal) });
  const preview = useQuery({ queryKey: ["recurring-preview", today, addDays(today, 31)], queryFn: ({ signal }) => api.get<RecurringPreview[]>(`/api/v1/recurring-preview?from=${today}&to=${addDays(today, 31)}`, signal) });
  const categories = useQuery({ queryKey: ["categories", form.kind], queryFn: ({ signal }) => api.get<Category[]>(`/api/v1/categories?kind=${form.kind}&includeArchived=false`, signal), enabled: showForm });
  const occurrenceCategories = useQuery({ queryKey: ["categories", editingOccurrence?.kind], queryFn: ({ signal }) => api.get<Category[]>(`/api/v1/categories?kind=${editingOccurrence?.kind}&includeArchived=false`, signal), enabled: Boolean(editingOccurrence) });
  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["recurring-rules"] }),
    queryClient.invalidateQueries({ queryKey: ["recurring-occurrences"] }),
    queryClient.invalidateQueries({ queryKey: ["recurring-preview"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  ]);
  const saveRule = useMutation({
    mutationFn: () => {
      const body = { clientRequestId: crypto.randomUUID(), kind: form.kind, amountMinor: Number(form.amount), categoryId: form.categoryId, title: form.title, frequency: form.frequency, intervalCount: Number(form.interval), startOn: form.startOn };
      return editing ? api.patch(`/api/v1/recurring-rules/${editing.id}`, body) : api.post("/api/v1/recurring-rules", body);
    },
    onSuccess: async () => { await refresh(); setShowForm(false); setEditing(undefined); showToast({ message: editing ? "週期規則已更新。" : "週期規則已建立。" }); },
  });
  const confirm = useMutation({ mutationFn: ({ id, override }: { id: number; override: Record<string, unknown> }) => api.post(`/api/v1/recurring-occurrences/${id}/confirm`, override), onSuccess: async () => { await refresh(); setEditingOccurrence(undefined); showToast({ message: "週期項目已確認並記入交易。" }); } });
  const skip = useMutation({ mutationFn: (id: number) => api.post(`/api/v1/recurring-occurrences/${id}/skip`, {}), onSuccess: async () => { await refresh(); showToast({ message: "已略過這次週期項目。" }); } });
  const stateRule = useMutation({ mutationFn: ({ id, action }: { id: number; action: "enable" | "disable" | "archive" }) => api.post(`/api/v1/recurring-rules/${id}/${action}`, {}), onSuccess: refresh });
  function beginEdit(rule: RecurringRule) {
    setEditing(rule);
    setForm({ kind: rule.kind, amount: String(rule.amountMinor), categoryId: rule.category.id, title: rule.title, frequency: rule.frequency, interval: String(rule.intervalCount), startOn: rule.startOn });
    setShowForm(true);
  }
  function beginOccurrenceEdit(item: RecurringOccurrence) {
    setEditingOccurrence(item);
    setOccurrenceForm({ amount: String(item.amountMinor), categoryId: item.category.id, title: item.title, occurredAt: `${item.scheduledOn}T12:00` });
  }
  if (rules.isPending || pending.isPending || preview.isPending) return <PageLoading />;
  if (rules.isError) return <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />;
  if (pending.isError) return <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />;
  if (preview.isError) return <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />;
  return <>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>週期收支</p><h1>待處理項目</h1><p>只有確認後才會計入實際收支。</p></div><button className={styles.primaryButton} type="button" onClick={() => { setEditing(undefined); setForm({ kind: "expense", amount: "", title: "", frequency: "monthly", interval: "1", startOn: today }); setShowForm(true); }}>＋ 新規則</button></header>
    {skip.error || stateRule.error ? <p className={styles.formError}>{errorMessage(skip.error || stateRule.error)}</p> : null}
    {showForm ? <section className={`${styles.card} ${styles.cardPadding}`}>
      <div className={styles.sectionTitle}><h2>{editing ? "編輯週期規則" : "建立週期規則"}</h2><button className={styles.textButton} type="button" onClick={() => setShowForm(false)}>取消</button></div>
      <form className={styles.form} onSubmit={(event: FormEvent) => { event.preventDefault(); saveRule.mutate(); }}>
        <div className={styles.tabs}>{(["expense", "income"] as Kind[]).map((kind) => <button key={kind} type="button" className={`${styles.tab} ${form.kind === kind ? styles.tabActive : ""}`} onClick={() => setForm((value) => ({ ...value, kind, categoryId: undefined }))}>{kind === "expense" ? "支出" : "收入"}</button>)}</div>
        <label className={styles.field}><span className={styles.label}>金額</span><input className={styles.input} type="number" inputMode="numeric" min="1" step="1" value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} required /></label>
        <label className={styles.field}><span className={styles.label}>分類</span><select className={styles.select} value={form.categoryId ?? ""} onChange={(event) => setForm((value) => ({ ...value, categoryId: Number(event.target.value) || undefined }))} required><option value="">請選擇</option>{(categories.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className={styles.field}><span className={styles.label}>標題（選填）</span><input className={styles.input} maxLength={80} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><label className={styles.field}><span className={styles.label}>每隔</span><input className={styles.input} type="number" min="1" max="100" value={form.interval} onChange={(event) => setForm((value) => ({ ...value, interval: event.target.value }))} required /></label><label className={styles.field}><span className={styles.label}>頻率</span><select className={styles.select} value={form.frequency} onChange={(event) => setForm((value) => ({ ...value, frequency: event.target.value as RuleForm["frequency"] }))}><option value="weekly">週</option><option value="monthly">月</option><option value="yearly">年</option></select></label></div>
        <label className={styles.field}><span className={styles.label}>開始日期</span><input className={styles.input} type="date" value={form.startOn} onChange={(event) => setForm((value) => ({ ...value, startOn: event.target.value }))} required /></label>
        {saveRule.error ? <p className={styles.formError}>{errorMessage(saveRule.error)}</p> : null}
        <button className={styles.primaryButton} type="submit" disabled={saveRule.isPending || !form.categoryId || Number(form.amount) <= 0}>{saveRule.isPending ? "儲存中…" : "儲存規則"}</button>
      </form>
    </section> : null}
    {editingOccurrence ? <section className={`${styles.card} ${styles.cardPadding} ${styles.section}`}><div className={styles.sectionTitle}><h2>調整這一次</h2><button className={styles.textButton} type="button" onClick={() => setEditingOccurrence(undefined)}>取消</button></div><form className={styles.form} onSubmit={(event) => { event.preventDefault(); confirm.mutate({ id: editingOccurrence.id, override: { clientRequestId: crypto.randomUUID(), amountMinor: Number(occurrenceForm.amount), categoryId: occurrenceForm.categoryId, title: occurrenceForm.title, occurredAt: zonedLocalToISO(occurrenceForm.occurredAt, settings.timezone) } }); }}><label className={styles.field}><span className={styles.label}>金額</span><input className={styles.input} type="number" min="1" step="1" value={occurrenceForm.amount} onChange={(event) => setOccurrenceForm((value) => ({ ...value, amount: event.target.value }))} required /></label><label className={styles.field}><span className={styles.label}>分類</span><select className={styles.select} value={occurrenceForm.categoryId ?? ""} onChange={(event) => setOccurrenceForm((value) => ({ ...value, categoryId: Number(event.target.value) || undefined }))} required><option value="">請選擇</option>{(occurrenceCategories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className={styles.field}><span className={styles.label}>標題（選填）</span><input className={styles.input} value={occurrenceForm.title} maxLength={80} onChange={(event) => setOccurrenceForm((value) => ({ ...value, title: event.target.value }))} /></label><label className={styles.field}><span className={styles.label}>發生時間</span><input className={styles.input} type="datetime-local" value={occurrenceForm.occurredAt} onChange={(event) => setOccurrenceForm((value) => ({ ...value, occurredAt: event.target.value }))} required /></label>{confirm.error ? <p className={styles.formError}>{errorMessage(confirm.error)}</p> : null}<button className={styles.primaryButton} type="submit" disabled={confirm.isPending || !occurrenceForm.categoryId || Number(occurrenceForm.amount) <= 0}>調整並確認</button></form></section> : null}
    <section className={styles.section}><div className={styles.sectionTitle}><h2>需要確認</h2><span className={styles.countPill}>{pending.data.length} 項</span></div>{pending.data.length ? <div className={`${styles.card} ${styles.cardPadding}`}>{pending.data.map((item) => <div key={item.id} className={styles.occurrenceRow}><div className={styles.rowGrow}><strong>{item.title || item.category.name}</strong><small>{item.scheduledOn} · {item.category.name}</small></div><MoneyText amount={item.amountMinor} currency={item.currencyCode} kind={item.kind} /><div className={styles.actions}><button className={styles.primaryButton} type="button" disabled={confirm.isPending} onClick={() => confirm.mutate({ id: item.id, override: {} })}>確認</button><button className={styles.textButton} type="button" disabled={confirm.isPending} onClick={() => beginOccurrenceEdit(item)}>調整</button><button className={styles.textButton} type="button" disabled={skip.isPending} onClick={() => skip.mutate(item.id)}>略過</button></div></div>)}</div> : <EmptyState title="沒有待處理項目">到期的週期收入與支出會在這裡等待你確認。</EmptyState>}</section>
    <section className={styles.section}><div className={styles.sectionTitle}><h2>規則</h2></div>{rules.data.length ? <div className={`${styles.card} ${styles.cardPadding}`}>{rules.data.map((rule) => <div key={rule.id} className={styles.ruleRow}><div className={styles.rowGrow}><strong>{rule.title || rule.category.name}</strong><small>每 {rule.intervalCount} {rule.frequency === "weekly" ? "週" : rule.frequency === "monthly" ? "月" : "年"} · 下次 {rule.nextDueOn} · {rule.enabled ? "啟用" : "停用"}</small></div><MoneyText amount={rule.amountMinor} currency={rule.currencyCode} kind={rule.kind} /><div className={styles.actions}><button className={styles.textButton} type="button" onClick={() => beginEdit(rule)}>編輯</button><button className={styles.textButton} type="button" onClick={() => stateRule.mutate({ id: rule.id, action: rule.enabled ? "disable" : "enable" })}>{rule.enabled ? "停用" : "啟用"}</button><button className={styles.textButton} type="button" onClick={() => stateRule.mutate({ id: rule.id, action: "archive" })}>封存</button></div></div>)}</div> : <EmptyState title="還沒有週期規則">房租、薪資或訂閱可建立為需要確認的週期項目。</EmptyState>}</section>
    <section className={styles.section}><div className={styles.sectionTitle}><h2>未來 30 天</h2></div>{preview.data?.length ? <div className={styles.list}>{preview.data.map((item, index) => <div className={styles.transactionRow} key={`${item.ruleId}-${item.scheduledOn}-${index}`}><span className={styles.rowTime}>{item.scheduledOn.slice(5)}</span><span className={styles.rowMain}><span className={styles.rowTitle}>{item.title || item.category.name}</span><span className={styles.rowMeta}>預計 · 尚未記帳</span></span><MoneyText className={styles.rowAmount} amount={item.amountMinor} currency={item.currencyCode} kind={item.kind} /></div>)}</div> : <EmptyState title="未來 30 天沒有預計項目">啟用中的規則會在這裡顯示預覽，但不會計入儀表板。</EmptyState>}</section>
  </>;
}
