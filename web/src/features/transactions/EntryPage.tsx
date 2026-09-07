import { useState } from "react";
import { Link } from "react-router-dom";
import type { Settings } from "../../api/types";
import { Card, SegmentedControl } from "../../components/ui";
import { useI18n } from "../../i18n";
import { BudgetsPage } from "../budgets/BudgetsPage";
import { TransactionEntry } from "./TransactionEntry";
import styles from "../../styles/ui.module.css";

export function EntryPage({
  settings,
  readOnly = false,
}: {
  settings: Settings;
  readOnly?: boolean;
}) {
  const { messages } = useI18n();
  const [mode, setMode] = useState<"expense" | "income" | "budget">("expense");
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>SIMFIMENT</p>
          <h1>{messages.entry.title}</h1>
          <p>{messages.entry.subtitle}</p>
        </div>
        <Link to="/today">{messages.entry.viewToday}</Link>
      </header>
      <div className={styles.entryPage}>
        <SegmentedControl
          label={messages.entry.record}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "expense", label: messages.common.expense },
            { value: "income", label: messages.common.income },
            { value: "budget", label: messages.budget.edit },
          ]}
        />
        <div hidden={mode === "budget"}>
          <Card>
            <TransactionEntry
              inline
              open={!readOnly && mode !== "budget"}
              selectedKind={mode === "budget" ? undefined : mode}
              settings={settings}
              onClose={() => {}}
            />
          </Card>
        </div>
        {mode === "budget" && <BudgetsPage embedded settings={settings} />}
      </div>
    </>
  );
}
