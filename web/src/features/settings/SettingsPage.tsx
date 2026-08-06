import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage, setCSRFToken } from "../../api/client";
import type { Category, Kind, Meta, OperationsStatus, Session, Settings } from "../../api/types";
import { ErrorState, PageLoading } from "../../components/States";
import { useToast } from "../../components/Toast/ToastProvider";
import {
  ActionMenu,
  AdaptiveModal,
  Button,
  Card,
  CategoryIcon,
  CheckboxField,
  Chip,
  Icon,
  IconPickerField,
  SegmentedControl,
  SwitchField,
  TextField,
  categoryIconChoices,
  type IconName,
} from "../../components/ui";
import styles from "../../styles/ui.module.css";

const iconOptions = categoryIconChoices.map(({ value, label, keywords }) => ({
  value,
  label,
  keywords,
  icon: <CategoryIcon iconKey={value} width={24} height={24} />,
}));

const settingsTabs = [
  { to: "/settings", label: "一般", icon: "settings" },
  { to: "/settings/categories", label: "分類", icon: "category" },
  { to: "/settings/location", label: "位置", icon: "location" },
  { to: "/settings/security", label: "安全", icon: "security" },
] satisfies Array<{ to: string; label: string; icon: IconName }>;

export function SettingsPage({ settings, meta }: { settings: Settings; meta: Meta }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [timezoneDraft, setTimezoneDraft] = useState(settings.timezone);
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const onCategories = location.pathname === "/settings/categories";
  const onSecurity = location.pathname === "/settings/security";
  const onLocation = location.pathname === "/settings/location";
  const expense = useQuery({
    queryKey: ["categories", "expense", "all"],
    queryFn: ({ signal }) =>
      api.get<Category[]>("/api/v1/categories?kind=expense&includeArchived=true", signal),
    enabled: onCategories,
  });
  const income = useQuery({
    queryKey: ["categories", "income", "all"],
    queryFn: ({ signal }) =>
      api.get<Category[]>("/api/v1/categories?kind=income&includeArchived=true", signal),
    enabled: onCategories,
  });
  const operations = useQuery({
    queryKey: ["operations-status"],
    queryFn: ({ signal }) => api.get<OperationsStatus>("/api/v1/operations/status", signal),
    enabled: !onCategories && !onSecurity && !onLocation,
  });
  const refreshSession = async () => {
    const session = await api.get<Session>("/api/v1/session");
    setCSRFToken(session.csrfToken);
    queryClient.setQueryData(["session"], session);
  };
  const patchSettings = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<Record<string, unknown>, Settings>("/api/v1/settings", body),
    onSuccess: async () => {
      await refreshSession();
      showToast({ message: "設定已更新。" });
    },
  });
  const password = useMutation({
    mutationFn: () => api.put("/api/v1/password", { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast({ message: "密碼已變更，其他登入階段已撤銷。" });
    },
  });
  const logout = useMutation({
    mutationFn: () => api.delete("/api/v1/session"),
    onSuccess: async () => {
      await queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
  const revoke = useMutation({
    mutationFn: () => api.post("/api/v1/sessions/revoke-others", {}),
    onSuccess: () => showToast({ message: "其他登入階段已撤銷。" }),
  });

  if (onCategories && (expense.isPending || income.isPending))
    return (
      <SettingsScaffold>
        <PageLoading />
      </SettingsScaffold>
    );
  if (expense.isError)
    return (
      <SettingsScaffold>
        <ErrorState error={expense.error} onRetry={() => void expense.refetch()} />
      </SettingsScaffold>
    );
  if (income.isError)
    return (
      <SettingsScaffold>
        <ErrorState error={income.error} onRetry={() => void income.refetch()} />
      </SettingsScaffold>
    );

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("兩次輸入的新密碼不同。");
      return;
    }
    password.mutate();
  }

  const sharedError = patchSettings.error || logout.error || revoke.error || operations.error;
  return (
    <SettingsScaffold>
      {sharedError ? <p className={styles.formError}>{errorMessage(sharedError)}</p> : null}
      {onCategories ? (
        <div className={styles.settingsGrid}>
          <Card className={styles.settingWide}>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="category" />
              </span>
              <div>
                <h2>分類</h2>
                <p>封存後仍會保留歷史交易；每種類型至少保留一個啟用分類。</p>
              </div>
            </div>
            <CategoryManager kind="expense" title="支出分類" items={expense.data ?? []} />
            <CategoryManager kind="income" title="收入分類" items={income.data ?? []} />
          </Card>
        </div>
      ) : onSecurity ? (
        <div className={styles.settingsGrid}>
          <Card>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="lock" />
              </span>
              <div>
                <h2>變更密碼</h2>
                <p>完成後會自動撤銷其他裝置的登入階段。</p>
              </div>
            </div>
            <form className={styles.form} onSubmit={submitPassword}>
              <TextField
                label="目前密碼"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <TextField
                label="新密碼"
                supportingText="至少 12 個字元"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                required
              />
              <TextField
                label="確認新密碼"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              {passwordError || password.error ? (
                <p className={styles.formError}>{passwordError || errorMessage(password.error)}</p>
              ) : null}
              <Button variant="outlined" type="submit" loading={password.isPending}>
                更新密碼
              </Button>
            </form>
          </Card>
          <Card>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="devices" />
              </span>
              <div>
                <h2>登入階段</h2>
                <p>撤銷其他裝置上的登入階段；目前裝置會保持登入。</p>
              </div>
            </div>
            <div className={styles.actions}>
              <Button
                variant="outlined"
                type="button"
                onClick={() => revoke.mutate()}
                loading={revoke.isPending}
              >
                撤銷其他階段
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={() => logout.mutate()}
                loading={logout.isPending}
              >
                <Icon name="logout" size={19} />
                登出
              </Button>
            </div>
          </Card>
        </div>
      ) : onLocation ? (
        <div className={styles.settingsGrid}>
          <Card className={styles.settingWide}>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="location" />
              </span>
              <div>
                <h2>輸入位置</h2>
                <p>座標保存在 Simfiment；交易儲存不會等待位置。</p>
              </div>
            </div>
            <SwitchField
              checked={settings.automaticLocationEnabled}
              onCheckedChange={(automaticLocationEnabled) =>
                patchSettings.mutate({ automaticLocationEnabled })
              }
              disabled={patchSettings.isPending}
              label="新交易自動嘗試附上位置"
              description="瀏覽器拒絕或逾時時，交易仍會正常儲存。"
            />
            <div className={styles.privacyNote}>
              <Icon name="security" size={20} />
              <p>
                <strong>隱私說明</strong>
                <br />
                開啟含位置的交易明細時，座標會提供給 OpenStreetMap
                以顯示地圖；你可以隨時移除已儲存的位置。
              </p>
            </div>
          </Card>
        </div>
      ) : (
        <div className={styles.settingsGrid}>
          <Card>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="palette" />
              </span>
              <div>
                <h2>外觀</h2>
                <p>選擇跟隨裝置或固定明暗主題。</p>
              </div>
            </div>
            <SegmentedControl
              label="外觀主題"
              value={settings.theme}
              onValueChange={(theme) => patchSettings.mutate({ theme })}
              options={[
                { value: "system", label: "系統" },
                { value: "light", label: "淺色" },
                { value: "dark", label: "深色" },
              ]}
            />
          </Card>
          <Card>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="calendar" />
              </span>
              <div>
                <h2>時區與格式</h2>
                <p>變更時區不會重新分組既有資料。</p>
              </div>
            </div>
            <div className={styles.form}>
              <TextField
                label="IANA 時區"
                value={timezoneDraft}
                onChange={(event) => {
                  setTimezoneDraft(event.target.value);
                  setTimezoneConfirmed(false);
                }}
                supportingText="例如 Asia/Taipei"
              />
              {timezoneDraft !== settings.timezone ? (
                <CheckboxField
                  checked={timezoneConfirmed}
                  onCheckedChange={setTimezoneConfirmed}
                  label="我了解歷史日／月分組不會自動改變"
                />
              ) : null}
              <Button
                variant="outlined"
                type="button"
                disabled={timezoneDraft === settings.timezone || !timezoneConfirmed}
                loading={patchSettings.isPending}
                onClick={() =>
                  patchSettings.mutate({ timezone: timezoneDraft, confirmTimezoneChange: true })
                }
              >
                更新時區
              </Button>
              <div className={styles.metaList}>
                <span>介面語系</span>
                <strong>繁體中文（{settings.locale}）</strong>
                <span>安裝幣別</span>
                <strong>{settings.currencyCode}</strong>
              </div>
            </div>
          </Card>
          <Card className={styles.settingWide}>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="info" />
              </span>
              <div>
                <h2>系統狀態</h2>
                <p>Simfiment {meta.version}</p>
              </div>
            </div>
            <div className={styles.statusGrid}>
              <div>
                <span>資料庫</span>
                <strong>
                  {operations.data?.databaseHealthy
                    ? "正常"
                    : operations.isPending
                      ? "檢查中"
                      : "需要檢查"}
                </strong>
              </div>
              <div>
                <span>備份</span>
                <strong>{operations.data ? `${operations.data.backupCount} 份` : "檢查中"}</strong>
              </div>
              <div>
                <span>最近備份</span>
                <strong>
                  {operations.data?.lastBackupAt
                    ? new Intl.DateTimeFormat("zh-TW", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(operations.data.lastBackupAt))
                    : "尚無"}
                </strong>
              </div>
            </div>
            <p className={styles.hint}>
              備份由伺服器執行 <code>simfiment backup create</code> 建立，介面不提供資料庫下載。
            </p>
          </Card>
        </div>
      )}
    </SettingsScaffold>
  );
}

function SettingsScaffold({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>偏好與安全</p>
          <h1>設定</h1>
          <p>管理分類、位置、外觀與登入密碼。</p>
        </div>
      </header>
      <nav className={styles.settingsTabs} aria-label="設定區段">
        {settingsTabs.map((tab) => (
          <NavLink
            key={tab.to}
            end
            className={({ isActive }) =>
              `${styles.settingsTab} ${isActive ? styles.settingsTabActive : ""}`
            }
            to={tab.to}
          >
            <Icon name={tab.icon} size={19} />
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}

function CategoryManager({ kind, title, items }: { kind: Kind; title: string; items: Category[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("");
  const [renaming, setRenaming] = useState<Category>();
  const [renameValue, setRenameValue] = useState("");
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["categories", kind] }),
      queryClient.invalidateQueries({ queryKey: ["categories", kind, "all"] }),
    ]);
  const add = useMutation({
    mutationFn: () => api.post("/api/v1/categories", { kind, name, iconKey }),
    onSuccess: async () => {
      setName("");
      setIconKey("");
      await refresh();
      showToast({ message: "分類已建立。" });
    },
  });
  const action = useMutation({
    mutationFn: ({
      item,
      action: nextAction,
      name: nextName,
      nextIcon,
    }: {
      item: Category;
      action: "archive" | "restore" | "update";
      name?: string;
      nextIcon?: string;
    }) =>
      nextAction === "update"
        ? api.patch(`/api/v1/categories/${item.id}`, {
            name: nextName ?? item.name,
            iconKey: nextIcon ?? item.iconKey,
          })
        : api.post(`/api/v1/categories/${item.id}/${nextAction}`, {}),
    onSuccess: async () => {
      await refresh();
      setRenaming(undefined);
    },
  });
  const active = items.filter((item) => !item.archivedAt);
  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) => api.put("/api/v1/categories/order", { kind, orderedIds }),
    onSuccess: refresh,
  });
  function move(item: Category, direction: -1 | 1) {
    const index = active.findIndex((value) => value.id === item.id);
    const target = index + direction;
    if (target < 0 || target >= active.length) return;
    const next = active.map((value) => value.id);
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate(next);
  }
  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>
        <h3>{title}</h3>
        <Chip>{active.length} 個啟用</Chip>
      </div>
      <div className={styles.categoryList}>
        {items.map((item) => (
          <div key={item.id} className={styles.categoryManageRow}>
            <span className={styles.rowCategoryIcon}>
              <CategoryIcon iconKey={item.iconKey} width={22} height={22} />
            </span>
            <div className={styles.rowGrow}>
              <strong>{item.name}</strong>
              <small>{item.archivedAt ? "已封存" : "啟用中"}</small>
            </div>
            {!item.archivedAt ? (
              <div className={styles.categoryIconSelect}>
                <IconPickerField
                  hideLabel
                  label={`${item.name} 圖示`}
                  value={item.iconKey}
                  onValueChange={(nextIcon) => action.mutate({ item, action: "update", nextIcon })}
                  options={iconOptions}
                />
              </div>
            ) : null}
            <ActionMenu
              items={
                !item.archivedAt
                  ? [
                      {
                        label: "上移",
                        icon: "arrowUp",
                        disabled: active[0]?.id === item.id,
                        onSelect: () => move(item, -1),
                      },
                      {
                        label: "下移",
                        icon: "arrowDown",
                        disabled: active.at(-1)?.id === item.id,
                        onSelect: () => move(item, 1),
                      },
                      {
                        label: "重新命名",
                        icon: "edit",
                        onSelect: () => {
                          setRenameValue(item.name);
                          setRenaming(item);
                        },
                      },
                      {
                        label: "封存",
                        icon: "archive",
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => action.mutate({ item, action: "archive" }),
                      },
                    ]
                  : [
                      {
                        label: "還原",
                        icon: "restore",
                        onSelect: () => action.mutate({ item, action: "restore" }),
                      },
                    ]
              }
            />
          </div>
        ))}
      </div>
      <div className={styles.categoryComposer}>
        <TextField
          label={`新增${title}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={30}
          placeholder="輸入分類名稱"
        />
        <IconPickerField
          className={styles.categoryComposerIcon}
          label="圖示"
          accessibleLabel={`新增${title}圖示`}
          value={iconKey}
          onValueChange={setIconKey}
          options={iconOptions}
        />
        <Button
          variant="tonal"
          type="button"
          disabled={!name.trim()}
          loading={add.isPending}
          onClick={() => add.mutate()}
        >
          <Icon name="add" size={20} />
          新增
        </Button>
      </div>
      {add.error || action.error || reorder.error ? (
        <p className={styles.formError}>
          {errorMessage(add.error || action.error || reorder.error)}
        </p>
      ) : null}
      <AdaptiveModal
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) setRenaming(undefined);
        }}
        title="重新命名分類"
      >
        {renaming ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (renameValue.trim())
                action.mutate({ item: renaming, action: "update", name: renameValue.trim() });
            }}
          >
            <TextField
              autoFocus
              label="分類名稱"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={30}
              required
            />
            <div className={styles.stickyAction}>
              <Button
                fullWidth
                type="submit"
                loading={action.isPending}
                disabled={!renameValue.trim()}
              >
                儲存名稱
              </Button>
            </div>
          </form>
        ) : null}
      </AdaptiveModal>
    </section>
  );
}
