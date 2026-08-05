import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../api/client";
import type { Category, EntryLocation, Kind, Settings, Transaction } from "../../api/types";
import { useToast } from "../../components/Toast/ToastProvider";
import { dateTimeInputInTimezone, zonedLocalToISO } from "../../lib/date";
import styles from "../../styles/ui.module.css";
import { useEntryLocation } from "./useEntryLocation";

type Props = { open: boolean; settings: Settings; onClose: () => void };

function newRequestID() {
  return crypto.randomUUID ? crypto.randomUUID() : `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TransactionEntry({ open, settings, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number>();
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => dateTimeInputInTimezone(new Date(), settings.timezone));
  const [locationEnabled, setLocationEnabled] = useState(settings.automaticLocationEnabled);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [requestId, setRequestId] = useState(newRequestID);
  // Geolocation is requested only while the entry dialog is open. Keeping this
  // gated avoids surprising permission prompts during ordinary app startup.
  const locationCapture = useEntryLocation(open && locationEnabled);
  const categoriesQuery = useQuery({ queryKey: ["categories", kind], queryFn: ({ signal }) => api.get<Category[]>(`/api/v1/categories?kind=${kind}&includeArchived=false`, signal), enabled: open });
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      window.setTimeout(() => amountRef.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => () => returnFocusRef.current?.focus(), []);

  const createCategory = useMutation({
    mutationFn: () => api.post<{ kind: Kind; name: string; iconKey: string }, Category>("/api/v1/categories", { kind, name: categoryName, iconKey: "" }),
    onSuccess: async (category) => {
      await queryClient.invalidateQueries({ queryKey: ["categories", kind] });
      setCategoryId(category.id);
      setCategoryName("");
      setAddingCategory(false);
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const immediateLocation: EntryLocation | undefined = locationCapture.location;
      return api.post<Record<string, unknown>, Transaction>("/api/v1/transactions", {
        clientRequestId: requestId,
        kind,
        amountMinor: Number(amount),
        categoryId,
        title,
        occurredAt: zonedLocalToISO(occurredAt, settings.timezone),
        locationIntent: !locationEnabled ? (settings.automaticLocationEnabled ? "skip" : "none") : "capture",
        ...(immediateLocation ? { location: immediateLocation } : {}),
      });
    },
    onSuccess: async (transaction) => {
      await invalidateTransactionQueries(queryClient);
      if (transaction.locationStatus === "pending") {
        void locationCapture.capturePromise.current.then(async (result) => {
          try {
            if (result.ok) await api.put(`/api/v1/transactions/${transaction.id}/location`, result.location);
            else await api.post(`/api/v1/transactions/${transaction.id}/location-failure`, { reason: result.reason });
            await invalidateTransactionQueries(queryClient);
          } catch { /* Location never changes the successful save outcome. */ }
        });
      }
      closeDialog(true);
      resetAfterSuccess();
      showToast({ message: "交易已記錄。", actionLabel: "復原", onAction: async () => {
        await api.delete(`/api/v1/transactions/${transaction.id}`);
        await invalidateTransactionQueries(queryClient);
      }});
    },
    onError: () => { submittingRef.current = false; },
  });
  function closeDialog(force = false) {
    if (create.isPending && !force) return;
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }
  function resetAfterSuccess() {
    submittingRef.current = false;
    setKind("expense");
    setAmount("");
    setCategoryId(undefined);
    setTitle("");
    setOccurredAt(dateTimeInputInTimezone(new Date(), settings.timezone));
    setLocationEnabled(settings.automaticLocationEnabled);
    setAddingCategory(false);
    setCategoryName("");
    setDetailsOpen(false);
    setRequestId(newRequestID());
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!create.isPending && Number.isInteger(Number(amount)) && Number(amount) > 0 && categoryId) {
      submittingRef.current = true;
      create.mutate();
    }
  }
  const fields = create.error instanceof ApiError ? create.error.fields : {};
  const statusText = !locationEnabled ? "關閉" : locationCapture.status === "finding" ? "尋找中…" : locationCapture.status === "ready" ? "已取得" : locationCapture.status === "permission_denied" ? "權限遭拒" : "無法取得";
  const statusClass = locationCapture.status === "ready" ? styles.statusReady : locationCapture.status === "finding" ? styles.statusFinding : "";
  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={(event) => { event.preventDefault(); closeDialog(); }} onClose={onClose}>
      <div className={styles.dialogHeader}>
        <h2>記錄交易</h2>
        <button className={styles.iconButton} type="button" aria-label="關閉記錄交易" onClick={() => closeDialog()}>×</button>
      </div>
      <form className={`${styles.dialogBody} ${styles.form}`} onSubmit={submit}>
        <div className={styles.tabs} role="tablist" aria-label="交易類型">
          {(["expense", "income"] as Kind[]).map((value) => <button key={value} className={`${styles.tab} ${kind === value ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={kind === value} onClick={() => { setKind(value); setCategoryId(undefined); }}>{value === "expense" ? "支出" : "收入"}</button>)}
        </div>
        <label className={styles.field}>
          <span className={styles.label}>金額</span>
          <span className={styles.amountWrap}><span className={styles.amountPrefix}>NT$</span><input ref={amountRef} className={styles.amountInput} inputMode="numeric" type="number" min="1" max="9000000000000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby={fields.amountMinor ? "amount-error" : undefined} required /></span>
          {fields.amountMinor ? <span id="amount-error" className={styles.fieldError}>{fields.amountMinor}</span> : null}
        </label>
        <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={styles.label}>分類</legend>
          <div className={styles.categoryGrid}>
            {(categoriesQuery.data ?? []).map((category) => <button key={category.id} className={`${styles.categoryButton} ${categoryId === category.id ? styles.categoryButtonSelected : ""}`} type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}
            <button className={styles.categoryButton} type="button" onClick={() => setAddingCategory((value) => !value)}>＋ 新分類</button>
          </div>
          {fields.categoryId ? <span className={styles.fieldError}>{fields.categoryId}</span> : null}
          {addingCategory ? <div className={styles.inlineForm}><input className={styles.input} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="分類名稱" maxLength={30} aria-label="新分類名稱" /><button className={styles.secondaryButton} type="button" disabled={!categoryName.trim() || createCategory.isPending} onClick={() => createCategory.mutate()}>建立</button></div> : null}
          {createCategory.error ? <span className={styles.fieldError}>{errorMessage(createCategory.error)}</span> : null}
        </fieldset>
        <label className={styles.field}>
          <span className={styles.label}>標題 <span className={styles.hint}>（選填）</span></span>
          <input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="例如：午餐、捷運、房租" />
          {fields.title ? <span className={styles.fieldError}>{fields.title}</span> : null}
        </label>
        <details className={styles.details} open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
          <summary className={styles.label}>其他選項</summary>
          <div className={styles.form} style={{ marginTop: 14 }}>
            <label className={styles.field}><span className={styles.label}>日期與時間</span><input className={styles.input} type="datetime-local" value={occurredAt} max={dateTimeInputInTimezone(new Date(Date.now() + 5 * 60_000), settings.timezone)} onChange={(event) => setOccurredAt(event.target.value)} /></label>
            <label className={styles.checkRow}><input type="checkbox" checked={locationEnabled} onChange={(event) => setLocationEnabled(event.target.checked)} /><span><strong>附上這筆交易的輸入位置</strong><br /><span className={styles.hint}>這是記帳當下的位置，不代表消費地點。</span></span></label>
            <div className={styles.locationStatus} aria-live="polite"><span className={`${styles.statusDot} ${statusClass}`} />位置：{statusText}</div>
          </div>
        </details>
        {create.error ? <p className={styles.formError}>{errorMessage(create.error)}</p> : null}
        <div className={styles.stickyAction}><button className={`${styles.primaryButton} ${styles.fullButton}`} type="submit" disabled={create.isPending || !categoryId || !Number.isInteger(Number(amount)) || Number(amount) <= 0}>{create.isPending ? "儲存中…" : `儲存${kind === "expense" ? "支出" : "收入"}`}</button></div>
      </form>
    </dialog>
  );
}

export async function invalidateTransactionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["transaction"] }),
    queryClient.invalidateQueries({ queryKey: ["recurring-occurrences"] }),
  ]);
}
