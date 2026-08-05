import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../api/client";
import type { Category, EntryLocation, Kind, Settings, Transaction } from "../../api/types";
import { useToast } from "../../components/Toast/ToastProvider";
import {
  AdaptiveModal,
  Button,
  CategoryIcon,
  ChoiceChipGroup,
  Disclosure,
  NumericField,
  SegmentedControl,
  SwitchField,
  TextField,
} from "../../components/ui";
import { dateTimeInputInTimezone, zonedLocalToISO } from "../../lib/date";
import styles from "../../styles/ui.module.css";
import { useEntryLocation } from "./useEntryLocation";

type Props = { open: boolean; settings: Settings; onClose: () => void };

function newRequestID() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TransactionEntry({ open, settings, onClose }: Props) {
  const amountRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number>();
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    dateTimeInputInTimezone(new Date(), settings.timezone),
  );
  const [locationEnabled, setLocationEnabled] = useState(settings.automaticLocationEnabled);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [requestId, setRequestId] = useState(newRequestID);
  // Geolocation is requested only while the entry dialog is open. Keeping this
  // gated avoids surprising permission prompts during ordinary app startup.
  const locationCapture = useEntryLocation(open && locationEnabled);
  const categoriesQuery = useQuery({
    queryKey: ["categories", kind],
    queryFn: ({ signal }) =>
      api.get<Category[]>(`/api/v1/categories?kind=${kind}&includeArchived=false`, signal),
    enabled: open,
  });
  useEffect(() => {
    if (open) window.setTimeout(() => amountRef.current?.focus(), 80);
  }, [open]);

  const createCategory = useMutation({
    mutationFn: () =>
      api.post<{ kind: Kind; name: string; iconKey: string }, Category>("/api/v1/categories", {
        kind,
        name: categoryName,
        iconKey: "",
      }),
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
        locationIntent: !locationEnabled
          ? settings.automaticLocationEnabled
            ? "skip"
            : "none"
          : "capture",
        ...(immediateLocation ? { location: immediateLocation } : {}),
      });
    },
    onSuccess: async (transaction) => {
      await invalidateTransactionQueries(queryClient);
      if (transaction.locationStatus === "pending") {
        void locationCapture.capturePromise.current.then(async (result) => {
          try {
            if (result.ok)
              await api.put(`/api/v1/transactions/${transaction.id}/location`, result.location);
            else
              await api.post(`/api/v1/transactions/${transaction.id}/location-failure`, {
                reason: result.reason,
              });
            await invalidateTransactionQueries(queryClient);
          } catch {
            /* Location never changes the successful save outcome. */
          }
        });
      }
      closeDialog(true);
      resetAfterSuccess();
      showToast({
        message: "交易已記錄。",
        actionLabel: "復原",
        onAction: async () => {
          await api.delete(`/api/v1/transactions/${transaction.id}`);
          await invalidateTransactionQueries(queryClient);
        },
      });
    },
    onError: () => {
      submittingRef.current = false;
    },
  });
  function closeDialog(force = false) {
    if (create.isPending && !force) return;
    onClose();
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
  const statusText = !locationEnabled
    ? "關閉"
    : locationCapture.status === "finding"
      ? "尋找中…"
      : locationCapture.status === "ready"
        ? "已取得"
        : locationCapture.status === "permission_denied"
          ? "權限遭拒"
          : "無法取得";
  const statusClass =
    locationCapture.status === "ready"
      ? styles.statusReady
      : locationCapture.status === "finding"
        ? styles.statusFinding
        : "";
  return (
    <AdaptiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
      title="記錄交易"
      description="金額與分類即可完成，其他資料都可稍後補上。"
    >
      <form className={styles.form} onSubmit={submit}>
        <SegmentedControl
          label="交易類型"
          value={kind}
          onValueChange={(value) => {
            setKind(value);
            setCategoryId(undefined);
          }}
          options={[
            { value: "expense", label: "支出" },
            { value: "income", label: "收入" },
          ]}
        />
        <NumericField
          label="金額"
          prefix="NT$"
          value={amount}
          onValueChange={setAmount}
          min={1}
          max={9_000_000_000_000}
          required
          error={fields.amountMinor}
          amount
          inputRef={amountRef}
        />
        <fieldset className={styles.choiceFieldset}>
          <legend className={styles.label}>分類</legend>
          <ChoiceChipGroup
            label="分類"
            value={categoryId ? String(categoryId) : undefined}
            onValueChange={(value) => setCategoryId(Number(value))}
            options={(categoriesQuery.data ?? []).map((category) => ({
              value: String(category.id),
              label: category.name,
              icon: <CategoryIcon iconKey={category.iconKey} width={20} height={20} />,
            }))}
          />
          <Button
            variant="outlined"
            size="small"
            type="button"
            onClick={() => setAddingCategory((value) => !value)}
          >
            ＋ 新分類
          </Button>
          {fields.categoryId ? (
            <span className={styles.fieldError}>{fields.categoryId}</span>
          ) : null}
          {addingCategory ? (
            <div className={styles.inlineForm}>
              <TextField
                label="新分類名稱"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                maxLength={30}
              />
              <Button
                variant="tonal"
                type="button"
                loading={createCategory.isPending}
                disabled={!categoryName.trim()}
                onClick={() => createCategory.mutate()}
              >
                建立
              </Button>
            </div>
          ) : null}
          {createCategory.error ? (
            <span className={styles.fieldError}>{errorMessage(createCategory.error)}</span>
          ) : null}
        </fieldset>
        <TextField
          label="標題（選填）"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder="例如：午餐、捷運、房租"
          error={fields.title}
        />
        <Disclosure label="其他選項" open={detailsOpen} onOpenChange={setDetailsOpen}>
          <div className={styles.form}>
            <TextField
              label="日期與時間"
              type="datetime-local"
              value={occurredAt}
              max={dateTimeInputInTimezone(new Date(Date.now() + 5 * 60_000), settings.timezone)}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
            <SwitchField
              checked={locationEnabled}
              onCheckedChange={setLocationEnabled}
              label="附上這筆交易的輸入位置"
              description="這是記帳當下的位置，不代表消費地點。"
            />
            <div className={styles.locationStatus} aria-live="polite">
              <span className={`${styles.statusDot} ${statusClass}`} />
              位置：{statusText}
            </div>
          </div>
        </Disclosure>
        {create.error ? <p className={styles.formError}>{errorMessage(create.error)}</p> : null}
        <div className={styles.stickyAction}>
          <Button
            fullWidth
            size="large"
            type="submit"
            loading={create.isPending}
            disabled={!categoryId || !Number.isInteger(Number(amount)) || Number(amount) <= 0}
          >{`儲存${kind === "expense" ? "支出" : "收入"}`}</Button>
        </div>
      </form>
    </AdaptiveModal>
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
