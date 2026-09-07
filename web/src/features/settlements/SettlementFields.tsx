import type { Kind } from "../../api/types";
import { SwitchField, TextField } from "../../components/ui";
import { useI18n } from "../../i18n";

export function SettlementFields({
  enabled,
  onEnabled,
  counterparty,
  onCounterparty,
  dueOn,
  onDueOn,
  kind,
  errors = {},
}: {
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  counterparty: string;
  onCounterparty: (value: string) => void;
  dueOn: string;
  onDueOn: (value: string) => void;
  kind: Kind;
  errors?: Record<string, string>;
}) {
  const {
    messages: { settlement: m },
  } = useI18n();
  return (
    <>
      <SwitchField
        label={m.enabled}
        description={
          enabled ? `${kind === "income" ? m.receivable : m.payable} · ${m.description}` : undefined
        }
        checked={enabled}
        onCheckedChange={onEnabled}
      />
      {enabled && (
        <>
          <TextField
            label={m.counterparty}
            value={counterparty}
            onChange={(e) => onCounterparty(e.target.value)}
            maxLength={80}
            required
            error={errors["settlement.counterparty"]}
          />
          <TextField
            label={m.dueOn}
            type="date"
            value={dueOn}
            onChange={(e) => onDueOn(e.target.value)}
            error={errors["settlement.dueOn"]}
          />
        </>
      )}
    </>
  );
}
