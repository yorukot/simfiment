import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import type { Meta, Session } from "../api/types";
import { TodayPage } from "../features/dashboards/TodayPage";
import { MonthPage } from "../features/dashboards/MonthPage";
import { RecurringPage } from "../features/recurring/RecurringPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TransactionDetails } from "../features/transactions/TransactionDetails";
import { TransactionEntry } from "../features/transactions/TransactionEntry";
import styles from "../styles/ui.module.css";

const navigation = [
  { to: "/today", label: "今天", glyph: "◷" },
  { to: "/month", label: "月份", glyph: "▦" },
  { to: "/recurring", label: "週期", glyph: "↻" },
  { to: "/settings", label: "設定", glyph: "⚙" },
];

export function AppShell({ session, meta }: { session: Session; meta: Meta }) {
  const [entryOpen, setEntryOpen] = useState(false);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (!editing && event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); setEntryOpen(true);
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  return <div className={styles.appFrame}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><span className={styles.brandMark}>S</span><span>Simfiment</span></div>
      <nav className={styles.sidebarNav} aria-label="主要導覽">{navigation.map((item) => <NavLink key={item.to} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`} to={item.to}><span className={styles.navGlyph} aria-hidden="true">{item.glyph}</span>{item.label}</NavLink>)}</nav>
      <button className={`${styles.primaryButton} ${styles.sidebarAdd}`} type="button" onClick={() => setEntryOpen(true)}>＋ 記錄交易</button>
    </aside>
    <main className={styles.main}><div className={styles.content}><Routes><Route path="/" element={<Navigate to="/today" replace />} /><Route path="/today" element={<TodayPage settings={session.settings} onAdd={() => setEntryOpen(true)} />} /><Route path="/day/:date" element={<TodayPage settings={session.settings} onAdd={() => setEntryOpen(true)} />} /><Route path="/month" element={<MonthPage settings={session.settings} />} /><Route path="/month/:month" element={<MonthPage settings={session.settings} />} /><Route path="/recurring" element={<RecurringPage settings={session.settings} />} /><Route path="/settings" element={<SettingsPage settings={session.settings} meta={meta} />} /><Route path="/settings/categories" element={<SettingsPage settings={session.settings} meta={meta} />} /><Route path="/settings/security" element={<SettingsPage settings={session.settings} meta={meta} />} /><Route path="/settings/location" element={<SettingsPage settings={session.settings} meta={meta} />} /><Route path="/transactions/:id" element={<TransactionDetails timezone={session.settings.timezone} />} /><Route path="*" element={<Navigate to="/today" replace />} /></Routes></div></main>
    <nav className={styles.bottomNav} aria-label="主要導覽">{navigation.slice(0, 2).map((item) => <MobileLink key={item.to} {...item} />)}<button className={styles.bottomAdd} type="button" aria-label="記錄交易" onClick={() => setEntryOpen(true)}><strong aria-hidden="true">＋</strong><span>記一筆</span></button>{navigation.slice(2).map((item) => <MobileLink key={item.to} {...item} />)}</nav>
    <TransactionEntry open={entryOpen} settings={session.settings} onClose={() => setEntryOpen(false)} />
  </div>;
}

function MobileLink({ to, label, glyph }: { to: string; label: string; glyph: string }) {
  return <NavLink className={({ isActive }) => `${styles.bottomLink} ${isActive ? styles.navLinkActive : ""}`} to={to}><span aria-hidden="true">{glyph}</span><span>{label}</span></NavLink>;
}
