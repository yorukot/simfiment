import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, errorMessage, setCSRFToken } from "../../api/client";
import type { Category, Kind, Meta, OperationsStatus, Session, Settings } from "../../api/types";
import { clearStartupSnapshot } from "../../app/startupSnapshot";
import { ErrorState, PageLoading } from "../../components/States";
import { useToast } from "../../components/Toast/ToastProvider";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { CurrencyField } from "../../components/CurrencyField";
import { useI18n } from "../../i18n";
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
  type CategoryIconTranslationKey,
  type IconName,
} from "../../components/ui";
import styles from "../../styles/ui.module.css";

export function SettingsPage({ settings, meta }: { settings: Settings; meta: Meta }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { messages } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [timezoneDraft, setTimezoneDraft] = useState(settings.timezone);
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const [currencyDraft, setCurrencyDraft] = useState(settings.currencyCode);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [currencyConfirmed, setCurrencyConfirmed] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File>();
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
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
    onSuccess: async (updated) => {
      await refreshSession();
      if (updated.currencyCode !== settings.currencyCode) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["budgets"] }),
          queryClient.invalidateQueries({ queryKey: ["transactions"] }),
          queryClient.invalidateQueries({ queryKey: ["transaction"] }),
          queryClient.invalidateQueries({ queryKey: ["recurring-rules"] }),
          queryClient.invalidateQueries({ queryKey: ["recurring-occurrences"] }),
          queryClient.invalidateQueries({ queryKey: ["recurring-preview"] }),
        ]);
      }
      setCurrencyDraft(updated.currencyCode);
      setCurrencyDialogOpen(false);
      setCurrencyConfirmed(false);
      showToast({ message: messages.settings.updated });
    },
  });
  const password = useMutation({
    mutationFn: () => api.put("/api/v1/password", { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast({ message: messages.settings.passwordUpdated });
    },
  });
  const logout = useMutation({
    mutationFn: () => api.delete("/api/v1/session"),
    onSuccess: async () => {
      clearStartupSnapshot();
      await queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
  const revoke = useMutation({
    mutationFn: () => api.post("/api/v1/sessions/revoke-others", {}),
    onSuccess: () => showToast({ message: messages.settings.sessionsRevoked }),
  });
  const restoreBackup = useMutation({
    mutationFn: (file: File) => api.uploadBackup("/api/v1/backups/restore", file),
    onSuccess: () => {
      setCSRFToken("");
      clearStartupSnapshot();
      queryClient.clear();
      window.location.replace("/login?restored=1");
    },
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
      setPasswordError(messages.settings.passwordMismatch);
      return;
    }
    password.mutate();
  }

  const sharedError = patchSettings.error || logout.error || revoke.error || operations.error;
  const settingsFields = patchSettings.error instanceof ApiError ? patchSettings.error.fields : {};
  const currencyDefinition = meta.currencies.find((item) => item.code === currencyDraft);
  const currencyExponent = currencyDefinition?.exponent ?? settings.currencyExponent;
  const truncatesCurrency = currencyExponent < settings.currencyExponent;
  const exampleFraction = "345".slice(0, settings.currencyExponent);
  const sourceExample = `${settings.currencyCode} 12${exampleFraction ? `.${exampleFraction}` : ""}`;
  const targetFraction = exampleFraction.slice(0, currencyExponent);
  const targetExample = `${currencyDraft} 12${targetFraction ? `.${targetFraction}` : ""}`;
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
                <h2>{messages.settings.categories}</h2>
                <p>{messages.settings.categoriesDescription}</p>
              </div>
            </div>
            <CategoryManager
              kind="expense"
              title={messages.settings.expenseCategories}
              items={expense.data ?? []}
            />
            <CategoryManager
              kind="income"
              title={messages.settings.incomeCategories}
              items={income.data ?? []}
            />
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
                <h2>{messages.settings.changePassword}</h2>
                <p>{messages.settings.changePasswordDescription}</p>
              </div>
            </div>
            <form className={styles.form} onSubmit={submitPassword}>
              <TextField
                label={messages.settings.currentPassword}
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <TextField
                label={messages.settings.newPassword}
                supportingText={messages.settings.passwordHint}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                required
              />
              <TextField
                label={messages.settings.confirmNewPassword}
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
                {messages.settings.updatePassword}
              </Button>
            </form>
          </Card>
          <Card>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="devices" />
              </span>
              <div>
                <h2>{messages.settings.sessions}</h2>
                <p>{messages.settings.sessionsDescription}</p>
              </div>
            </div>
            <div className={styles.actions}>
              <Button
                variant="outlined"
                type="button"
                onClick={() => revoke.mutate()}
                loading={revoke.isPending}
              >
                {messages.settings.revokeOtherSessions}
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={() => logout.mutate()}
                loading={logout.isPending}
              >
                <Icon name="logout" size={19} />
                {messages.settings.logout}
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
                <h2>{messages.settings.entryLocation}</h2>
                <p>{messages.settings.entryLocationDescription}</p>
              </div>
            </div>
            <SwitchField
              checked={settings.automaticLocationEnabled}
              onCheckedChange={(automaticLocationEnabled) =>
                patchSettings.mutate({ automaticLocationEnabled })
              }
              disabled={patchSettings.isPending}
              label={messages.settings.automaticLocation}
              description={messages.settings.automaticLocationDescription}
            />
            <div className={styles.privacyNote}>
              <Icon name="security" size={20} />
              <p>
                <strong>{messages.settings.privacy}</strong>
                <br />
                {messages.settings.privacyDescription}
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
                <h2>{messages.settings.appearance}</h2>
                <p>{messages.settings.appearanceDescription}</p>
              </div>
            </div>
            <div className={styles.appearanceControls}>
              <div className={styles.settingControl}>
                <span className={styles.settingControlLabel}>{messages.settings.theme}</span>
                <SegmentedControl
                  label={messages.settings.theme}
                  value={settings.theme}
                  onValueChange={(theme) => patchSettings.mutate({ theme })}
                  options={[
                    { value: "system", label: messages.settings.systemTheme },
                    { value: "light", label: messages.settings.lightTheme },
                    { value: "dark", label: messages.settings.darkTheme },
                  ]}
                />
              </div>
              <div className={styles.settingControl}>
                <span className={styles.settingControlLabel}>{messages.language.label}</span>
                <LanguageSwitcher />
              </div>
            </div>
          </Card>
          <Card>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="calendar" />
              </span>
              <div>
                <h2>{messages.settings.timezoneAndFormat}</h2>
                <p>{messages.settings.timezoneDescription}</p>
              </div>
            </div>
            <div className={styles.form}>
              <TextField
                label={messages.settings.timezone}
                value={timezoneDraft}
                onChange={(event) => {
                  setTimezoneDraft(event.target.value);
                  setTimezoneConfirmed(false);
                }}
                supportingText={messages.settings.timezoneExample}
              />
              {timezoneDraft !== settings.timezone ? (
                <CheckboxField
                  checked={timezoneConfirmed}
                  onCheckedChange={setTimezoneConfirmed}
                  label={messages.settings.confirmTimezone}
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
                {messages.settings.updateTimezone}
              </Button>
              <CurrencyField
                currencies={meta.currencies}
                value={currencyDraft}
                onValueChange={(value) => {
                  setCurrencyDraft(value);
                  setCurrencyConfirmed(false);
                }}
                error={settingsFields.currencyCode}
                disabled={patchSettings.isPending}
              />
              <Button
                variant="outlined"
                type="button"
                disabled={currencyDraft === settings.currencyCode}
                onClick={() => setCurrencyDialogOpen(true)}
              >
                {messages.settings.updateCurrency}
              </Button>
            </div>
          </Card>
          <Card className={styles.settingWide}>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="restore" />
              </span>
              <div>
                <h2>{messages.settings.fullBackup}</h2>
                <p>{messages.settings.fullBackupDescription}</p>
              </div>
            </div>
            <div className={styles.form}>
              <div className={styles.privacyNote}>
                <Icon name="warning" size={20} />
                <p>{messages.settings.backupSensitive}</p>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="outlined"
                  type="button"
                  onClick={() => window.location.assign("/api/v1/backups/download")}
                >
                  <Icon name="download" size={19} />
                  {messages.settings.downloadBackup}
                </Button>
                <Button
                  variant="outlined"
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                >
                  <Icon name="upload" size={19} />
                  {messages.settings.chooseBackup}
                </Button>
                <input
                  ref={backupInputRef}
                  className={styles.srOnly}
                  type="file"
                  accept=".db,application/vnd.sqlite3"
                  aria-label={messages.settings.chooseBackup}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    restoreBackup.reset();
                    setRestoreFile(file);
                    setRestoreDialogOpen(true);
                  }}
                />
              </div>
            </div>
          </Card>
          <Card className={styles.settingWide}>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="download" />
              </span>
              <div>
                <h2>{messages.settings.dataExport}</h2>
                <p>{messages.settings.dataExportDescription}</p>
              </div>
            </div>
            <div className={styles.form}>
              <p className={styles.hint}>{messages.settings.dataExportContents}</p>
              <div className={styles.actions}>
                <Button
                  variant="outlined"
                  type="button"
                  onClick={() => window.location.assign("/api/v1/transactions/export.csv")}
                >
                  <Icon name="download" size={19} />
                  {messages.settings.exportCSV}
                </Button>
              </div>
            </div>
          </Card>
          <Card className={styles.settingWide}>
            <div className={styles.settingHeading}>
              <span className={styles.settingIcon}>
                <Icon name="info" />
              </span>
              <div>
                <h2>{messages.settings.systemStatus}</h2>
                <p>Simfiment {meta.version}</p>
              </div>
            </div>
            <div className={styles.statusGrid}>
              <div>
                <span>{messages.settings.database}</span>
                <strong>
                  {operations.data?.databaseHealthy
                    ? messages.settings.healthy
                    : operations.isPending
                      ? messages.settings.checking
                      : messages.settings.needsCheck}
                </strong>
              </div>
            </div>
          </Card>
        </div>
      )}
      <AdaptiveModal
        open={currencyDialogOpen}
        onOpenChange={(open) => {
          setCurrencyDialogOpen(open);
          if (!open) setCurrencyConfirmed(false);
        }}
        title={messages.settings.currencyChangeTitle}
        description={messages.settings.currencyChangeDescription(
          settings.currencyCode,
          currencyDraft,
        )}
      >
        <div className={styles.form}>
          <div className={styles.privacyNote}>
            <Icon name="info" size={20} />
            <p>{messages.settings.currencyNoExchange}</p>
          </div>
          {truncatesCurrency ? (
            <div className={styles.privacyNote}>
              <Icon name="warning" size={20} />
              <p>
                {messages.settings.currencyTruncateWarning(
                  currencyExponent,
                  `${sourceExample} → ${targetExample}`,
                )}
              </p>
            </div>
          ) : null}
          <CheckboxField
            checked={currencyConfirmed}
            onCheckedChange={setCurrencyConfirmed}
            label={messages.settings.confirmCurrencyChange}
          />
          {patchSettings.error ? (
            <p className={styles.formError}>{errorMessage(patchSettings.error)}</p>
          ) : null}
          <div className={styles.actions}>
            <Button
              type="button"
              disabled={!currencyConfirmed}
              loading={patchSettings.isPending}
              onClick={() =>
                patchSettings.mutate({
                  currencyCode: currencyDraft,
                  confirmCurrencyChange: true,
                })
              }
            >
              {messages.settings.confirmCurrencyAction}
            </Button>
            <Button
              variant="text"
              type="button"
              disabled={patchSettings.isPending}
              onClick={() => setCurrencyDialogOpen(false)}
            >
              {messages.common.cancel}
            </Button>
          </div>
        </div>
      </AdaptiveModal>
      <AdaptiveModal
        open={restoreDialogOpen}
        onOpenChange={(open) => {
          if (restoreBackup.isPending) return;
          setRestoreDialogOpen(open);
          if (!open) {
            setRestoreFile(undefined);
            restoreBackup.reset();
          }
        }}
        title={messages.settings.restoreBackupTitle}
        description={
          restoreFile ? messages.settings.restoreBackupDescription(restoreFile.name) : ""
        }
      >
        <div className={styles.form}>
          <div className={styles.privacyNote}>
            <Icon name="warning" size={20} />
            <p>{messages.settings.restoreBackupWarning}</p>
          </div>
          <p className={styles.hint}>{messages.settings.restoreBackupPassword}</p>
          {restoreBackup.error ? (
            <p className={styles.formError}>{errorMessage(restoreBackup.error)}</p>
          ) : null}
          <div className={styles.actions}>
            <Button
              variant="danger"
              type="button"
              disabled={!restoreFile}
              loading={restoreBackup.isPending}
              onClick={() => {
                if (restoreFile) restoreBackup.mutate(restoreFile);
              }}
            >
              {messages.settings.confirmRestoreBackup}
            </Button>
            <Button
              variant="text"
              type="button"
              disabled={restoreBackup.isPending}
              onClick={() => setRestoreDialogOpen(false)}
            >
              {messages.common.cancel}
            </Button>
          </div>
        </div>
      </AdaptiveModal>
    </SettingsScaffold>
  );
}

function SettingsScaffold({ children }: { children: React.ReactNode }) {
  const { messages } = useI18n();
  const settingsTabs = [
    { to: "/settings", label: messages.settings.general, icon: "settings" },
    { to: "/settings/categories", label: messages.settings.categories, icon: "category" },
    { to: "/settings/location", label: messages.settings.location, icon: "location" },
    { to: "/settings/security", label: messages.settings.security, icon: "security" },
  ] satisfies Array<{ to: string; label: string; icon: IconName }>;
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{messages.settings.eyebrow}</p>
          <h1>{messages.settings.title}</h1>
          <p>{messages.settings.intro}</p>
        </div>
      </header>
      <nav className={styles.settingsTabs} aria-label={messages.settings.sections}>
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
  const { messages } = useI18n();
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("");
  const [renaming, setRenaming] = useState<Category>();
  const [renameValue, setRenameValue] = useState("");
  const iconOptions = useMemo(
    () =>
      categoryIconChoices.map(({ value, label, keywords, translationKey }) => ({
        value,
        label: translationKey
          ? messages.icons[translationKey as CategoryIconTranslationKey]
          : label,
        keywords,
        icon: <CategoryIcon iconKey={value} width={24} height={24} />,
      })),
    [messages],
  );
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
      showToast({ message: messages.settings.categoryCreated });
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
        <Chip>{messages.settings.activeCount(active.length)}</Chip>
      </div>
      <Card className={styles.categoryList} padded={false}>
        {items.map((item) => (
          <div key={item.id} className={styles.categoryManageRow}>
            <span className={styles.rowCategoryIcon}>
              <CategoryIcon iconKey={item.iconKey} width={22} height={22} />
            </span>
            <div className={styles.rowGrow}>
              <strong>{item.name}</strong>
              <small>{item.archivedAt ? messages.common.archived : messages.common.active}</small>
            </div>
            {!item.archivedAt ? (
              <div className={styles.categoryIconSelect}>
                <IconPickerField
                  hideLabel
                  label={messages.settings.itemIcon(item.name)}
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
                        label: messages.settings.moveUp,
                        icon: "arrowUp",
                        disabled: active[0]?.id === item.id,
                        onSelect: () => move(item, -1),
                      },
                      {
                        label: messages.settings.moveDown,
                        icon: "arrowDown",
                        disabled: active.at(-1)?.id === item.id,
                        onSelect: () => move(item, 1),
                      },
                      {
                        label: messages.settings.rename,
                        icon: "edit",
                        onSelect: () => {
                          setRenameValue(item.name);
                          setRenaming(item);
                        },
                      },
                      {
                        label: messages.settings.archive,
                        icon: "archive",
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => action.mutate({ item, action: "archive" }),
                      },
                    ]
                  : [
                      {
                        label: messages.settings.restore,
                        icon: "restore",
                        onSelect: () => action.mutate({ item, action: "restore" }),
                      },
                    ]
              }
            />
          </div>
        ))}
      </Card>
      <div className={styles.categoryComposer}>
        <TextField
          label={messages.settings.addCategory(title)}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={30}
          placeholder={messages.settings.categoryNamePlaceholder}
        />
        <IconPickerField
          className={styles.categoryComposerIcon}
          label={messages.settings.icon}
          accessibleLabel={messages.settings.addCategoryIcon(title)}
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
          {messages.settings.add}
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
        title={messages.settings.renameCategory}
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
              label={messages.settings.categoryName}
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
                {messages.settings.saveName}
              </Button>
            </div>
          </form>
        ) : null}
      </AdaptiveModal>
    </section>
  );
}
