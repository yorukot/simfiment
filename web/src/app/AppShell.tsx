import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import type { Meta, Session } from "../api/types";
import { TodayPage } from "../features/dashboards/TodayPage";
import { MonthPage } from "../features/dashboards/MonthPage";
import { RecurringPage } from "../features/recurring/RecurringPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TransactionDetails } from "../features/transactions/TransactionDetails";
import { TransactionEntry } from "../features/transactions/TransactionEntry";
import { Button, Icon, type IconName } from "../components/ui";
import { useI18n } from "../i18n";
import styles from "../styles/ui.module.css";

export function AppShell({ session, meta }: { session: Session; meta: Meta }) {
  const { messages } = useI18n();
  const [entryOpen, setEntryOpen] = useState(false);
  const navigation = [
    { to: "/today", label: messages.nav.today, compactLabel: messages.nav.today, icon: "today" },
    { to: "/month", label: messages.nav.month, compactLabel: messages.nav.month, icon: "calendar" },
    {
      to: "/recurring",
      label: messages.nav.recurring,
      compactLabel: messages.nav.recurringCompact,
      icon: "repeat",
    },
    {
      to: "/settings",
      label: messages.nav.settings,
      compactLabel: messages.nav.settings,
      icon: "settings",
    },
  ] satisfies Array<{ to: string; label: string; compactLabel: string; icon: IconName }>;
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (
        !editing &&
        event.key.toLowerCase() === "n" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setEntryOpen(true);
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  return (
    <div className={styles.appFrame}>
      <aside className={styles.sidebar}>
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
        <nav className={styles.sidebarNav} aria-label={messages.nav.primary}>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
              to={item.to}
            >
              <span className={styles.navGlyph}>
                <Icon name={item.icon} />
              </span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <Button
          className={styles.sidebarAdd}
          type="button"
          onClick={() => setEntryOpen(true)}
          aria-label={messages.nav.recordTransaction}
        >
          <Icon name="add" />
          <span className={styles.sidebarAddLabel}>{messages.nav.recordTransaction}</span>
        </Button>
      </aside>
      <main className={styles.main}>
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route
              path="/today"
              element={<TodayPage settings={session.settings} onAdd={() => setEntryOpen(true)} />}
            />
            <Route
              path="/day/:date"
              element={<TodayPage settings={session.settings} onAdd={() => setEntryOpen(true)} />}
            />
            <Route path="/month" element={<MonthPage settings={session.settings} />} />
            <Route path="/month/:month" element={<MonthPage settings={session.settings} />} />
            <Route path="/recurring" element={<RecurringPage settings={session.settings} />} />
            <Route
              path="/settings"
              element={<SettingsPage settings={session.settings} meta={meta} />}
            />
            <Route
              path="/settings/categories"
              element={<SettingsPage settings={session.settings} meta={meta} />}
            />
            <Route
              path="/settings/security"
              element={<SettingsPage settings={session.settings} meta={meta} />}
            />
            <Route
              path="/settings/location"
              element={<SettingsPage settings={session.settings} meta={meta} />}
            />
            <Route
              path="/transactions/:id"
              element={<TransactionDetails settings={session.settings} />}
            />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
      </main>
      <nav className={styles.bottomNav} aria-label={messages.nav.primary}>
        {navigation.slice(0, 2).map((item) => (
          <MobileLink key={item.to} {...item} />
        ))}
        <button
          className={styles.bottomAdd}
          type="button"
          aria-label={messages.nav.recordTransaction}
          onClick={() => setEntryOpen(true)}
        >
          <strong>
            <Icon name="add" />
          </strong>
          <span>{messages.nav.addCompact}</span>
        </button>
        {navigation.slice(2).map((item) => (
          <MobileLink key={item.to} {...item} />
        ))}
      </nav>
      <TransactionEntry
        open={entryOpen}
        settings={session.settings}
        onClose={() => setEntryOpen(false)}
      />
    </div>
  );
}

function MobileLink({
  to,
  compactLabel,
  icon,
}: {
  to: string;
  label: string;
  compactLabel: string;
  icon: IconName;
}) {
  return (
    <NavLink
      className={({ isActive }) => `${styles.bottomLink} ${isActive ? styles.navLinkActive : ""}`}
      to={to}
    >
      <span className={styles.bottomIcon}>
        <Icon name={icon} />
      </span>
      <span>{compactLabel}</span>
    </NavLink>
  );
}
