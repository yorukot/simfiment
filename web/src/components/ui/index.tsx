import {
  Fragment,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { Collapsible } from "@base-ui/react/collapsible";
import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { Field } from "@base-ui/react/field";
import { Menu } from "@base-ui/react/menu";
import { NumberField } from "@base-ui/react/number-field";
import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import { Switch } from "@base-ui/react/switch";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Tooltip } from "@base-ui/react/tooltip";
import { Icon, type IconName } from "./icons";
import { useI18n } from "../../i18n";
import styles from "./primitives.module.css";

export {
  CategoryIcon,
  Icon,
  categoryIconChoices,
  type CategoryIconChoice,
  type CategoryIconTranslationKey,
  type IconName,
} from "./icons";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function UIProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delay={500}>{children}</Tooltip.Provider>;
}

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger";
export type ButtonSize = "small" | "medium" | "large";

export function Button({
  variant = "filled",
  size = "medium",
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  return (
    <BaseButton
      className={cx(
        styles.button,
        styles[variant],
        size !== "medium" && styles[size],
        fullWidth && styles.fullWidth,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span className={cx(styles.buttonContent, loading && styles.loadingLabel)}>{children}</span>
    </BaseButton>
  );
}

export function IconButton({
  label,
  icon,
  variant = "standard",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  icon: IconName;
  variant?: "standard" | "filled" | "tonal" | "outlined";
}) {
  return (
    <BaseButton
      className={cx(
        styles.iconButton,
        variant !== "standard" &&
          styles[`iconButton${variant[0]!.toUpperCase()}${variant.slice(1)}`],
        className,
      )}
      aria-label={label}
      {...props}
    >
      <Icon name={icon} />
    </BaseButton>
  );
}

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: ReactNode;
    supportingText?: ReactNode;
    error?: ReactNode;
  }
>(function TextField({ label, supportingText, error, required, className, ...props }, ref) {
  return (
    <Field.Root className={styles.field} invalid={Boolean(error)}>
      <Field.Label className={styles.fieldLabel}>
        {label}
        {required ? <span className={styles.required}> *</span> : null}
      </Field.Label>
      <Field.Control
        ref={ref}
        className={cx(styles.input, className)}
        required={required}
        {...props}
      />
      {error ? (
        <Field.Error className={styles.fieldError}>{error}</Field.Error>
      ) : supportingText ? (
        <Field.Description className={styles.supporting}>{supportingText}</Field.Description>
      ) : null}
    </Field.Root>
  );
});

export function NumericField({
  label,
  value,
  onValueChange,
  prefix,
  min,
  max,
  step,
  required,
  error,
  supportingText,
  amount,
  inputRef,
  fractionDigits,
}: {
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  error?: ReactNode;
  supportingText?: ReactNode;
  amount?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  fractionDigits?: number;
}) {
  const { locale } = useI18n();
  const numericValue = value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  return (
    <Field.Root className={cx(styles.field, amount && styles.amount)} invalid={Boolean(error)}>
      <Field.Label className={styles.fieldLabel}>
        {label}
        {required ? <span className={styles.required}> *</span> : null}
      </Field.Label>
      <NumberField.Root
        value={numericValue}
        onValueChange={(next) => onValueChange(next === null ? "" : String(next))}
        min={min}
        max={max}
        step={step ?? (fractionDigits === undefined ? 1 : 1 / 10 ** fractionDigits)}
        locale={locale}
        format={
          fractionDigits === undefined
            ? undefined
            : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
        }
      >
        <NumberField.Group className={styles.numberGroup}>
          {prefix ? <span className={styles.numberPrefix}>{prefix}</span> : null}
          <NumberField.Input
            ref={inputRef}
            className={styles.numberInput}
            required={required}
            inputMode={fractionDigits && fractionDigits > 0 ? "decimal" : "numeric"}
          />
        </NumberField.Group>
      </NumberField.Root>
      {error ? (
        <Field.Error className={styles.fieldError}>{error}</Field.Error>
      ) : supportingText ? (
        <Field.Description className={styles.supporting}>{supportingText}</Field.Description>
      ) : null}
    </Field.Root>
  );
}

export type SelectOption = { value: string; label: string };

export type SearchSelectOption = SelectOption & { keywords?: string };

export function SearchSelectField({
  label,
  value,
  onValueChange,
  options,
  searchLabel,
  searchPlaceholder,
  emptyText,
  supportingText,
  error,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SearchSelectOption[];
  searchLabel: string;
  searchPlaceholder: string;
  emptyText: string;
  supportingText?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.toLocaleLowerCase().trim();
  const filtered = options.filter((option) =>
    `${option.label} ${option.value} ${option.keywords ?? ""}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
  return (
    <Field.Root className={styles.field} invalid={Boolean(error)} disabled={disabled}>
      <Field.Label className={styles.fieldLabel} nativeLabel={false}>
        {label}
        {required ? <span className={styles.required}> *</span> : null}
      </Field.Label>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <Popover.Trigger className={styles.selectTrigger} aria-label={label} disabled={disabled}>
          <span className={styles.selectValue}>{selected?.label}</span>
          <Icon name="chevronDown" size={20} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className={styles.selectPositioner} sideOffset={8} align="start">
            <Popover.Popup
              className={styles.searchSelectPopup}
              role="dialog"
              aria-label={label}
              initialFocus={inputRef}
            >
              <input
                ref={inputRef}
                className={styles.searchSelectInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={searchLabel}
                placeholder={searchPlaceholder}
              />
              <div className={styles.searchSelectList} role="listbox" aria-label={label}>
                {filtered.length ? (
                  filtered.map((option) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      className={styles.searchSelectItem}
                      key={option.value}
                      onClick={() => {
                        onValueChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span>{option.label}</span>
                      {option.value === value ? <Icon name="check" size={18} /> : null}
                    </button>
                  ))
                ) : (
                  <p className={styles.searchSelectEmpty}>{emptyText}</p>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {error ? (
        <Field.Error className={styles.fieldError}>{error}</Field.Error>
      ) : supportingText ? (
        <Field.Description className={styles.supporting}>{supportingText}</Field.Description>
      ) : null}
    </Field.Root>
  );
}

export type IconPickerOption = {
  value: string;
  label: string;
  icon: ReactNode;
  keywords?: string;
};

const ICON_PICKER_PAGE_SIZE = 120;

function normalizeIconSearch(value: string) {
  return value.toLocaleLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

export function IconPickerField({
  label,
  accessibleLabel = label,
  value,
  onValueChange,
  options,
  disabled,
  hideLabel,
  className,
}: {
  label: string;
  accessibleLabel?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: IconPickerOption[];
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const { messages } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(ICON_PICKER_PAGE_SIZE);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const searchable = options.length > 20;
  const normalizedQuery = normalizeIconSearch(query);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      normalizeIconSearch(`${option.label} ${option.value} ${option.keywords ?? ""}`).includes(
        normalizedQuery,
      ),
    );
  }, [normalizedQuery, options]);
  const firstOptions = filteredOptions.slice(0, visibleCount);
  const visibleOptions =
    selected && filteredOptions.includes(selected) && !firstOptions.includes(selected)
      ? [selected, ...firstOptions]
      : firstOptions;
  const hasMore = visibleCount < filteredOptions.length;

  function resetSearch() {
    setQuery("");
    setVisibleCount(ICON_PICKER_PAGE_SIZE);
  }

  return (
    <div className={cx(styles.field, className)}>
      <span className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)}>{label}</span>
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetSearch();
        }}
      >
        <Popover.Trigger
          className={styles.iconPickerTrigger}
          aria-label={messages.common.labelledValue(
            accessibleLabel,
            selected?.label ?? messages.common.select,
          )}
          disabled={disabled}
        >
          {selected?.icon}
          <Icon name="chevronDown" size={18} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className={styles.menuPositioner} sideOffset={6} align="start">
            <Popover.Popup
              className={styles.iconPickerPopup}
              role="dialog"
              aria-label={accessibleLabel}
              initialFocus={searchable ? searchInputRef : undefined}
            >
              {searchable ? (
                <div className={styles.iconPickerSearch}>
                  <div className={styles.iconPickerSearchControl}>
                    <Icon name="search" size={20} />
                    <input
                      ref={searchInputRef}
                      className={styles.iconPickerSearchInput}
                      type="search"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setVisibleCount(ICON_PICKER_PAGE_SIZE);
                      }}
                      placeholder={messages.icons.searchPlaceholder}
                      aria-label={messages.icons.searchLabel}
                    />
                  </div>
                  <span className={styles.iconPickerResultCount} role="status" aria-live="polite">
                    {messages.icons.resultCount(
                      normalizedQuery ? filteredOptions.length : options.length,
                      Boolean(normalizedQuery),
                    )}
                  </span>
                </div>
              ) : null}
              <div
                className={styles.iconPickerScroll}
                onScroll={(event) => {
                  const target = event.currentTarget;
                  if (
                    hasMore &&
                    target.scrollHeight - target.scrollTop - target.clientHeight < 160
                  ) {
                    setVisibleCount((count) =>
                      Math.min(count + ICON_PICKER_PAGE_SIZE, filteredOptions.length),
                    );
                  }
                }}
              >
                {visibleOptions.length ? (
                  <div
                    className={styles.iconPickerGrid}
                    role="group"
                    aria-label={messages.icons.options}
                  >
                    {visibleOptions.map((option) => (
                      <button
                        key={option.value || "default"}
                        type="button"
                        className={styles.iconPickerItem}
                        aria-label={option.label}
                        aria-pressed={option.value === value}
                        title={option.label}
                        disabled={disabled}
                        onClick={() => {
                          onValueChange(option.value);
                          setOpen(false);
                        }}
                      >
                        {option.icon}
                        {option.value === value ? (
                          <span className={styles.iconPickerIndicator}>
                            <Icon name="check" size={12} />
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.iconPickerEmpty}>
                    <Icon name="search" size={28} />
                    <span>{messages.icons.empty(query.trim())}</span>
                    <button type="button" onClick={resetSearch}>
                      {messages.icons.clearSearch}
                    </button>
                  </div>
                )}
                {hasMore ? (
                  <button
                    type="button"
                    className={styles.iconPickerMore}
                    onClick={() => {
                      setVisibleCount((count) =>
                        Math.min(count + ICON_PICKER_PAGE_SIZE, filteredOptions.length),
                      );
                    }}
                  >
                    {messages.icons.showMore}
                  </button>
                ) : null}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  required,
  error,
  disabled,
  compact,
  hideLabel,
}: {
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  error?: ReactNode;
  disabled?: boolean;
  compact?: boolean;
  hideLabel?: boolean;
}) {
  const { messages } = useI18n();
  const resolvedPlaceholder = placeholder ?? messages.common.select;
  return (
    <Field.Root className={styles.field} invalid={Boolean(error)} disabled={disabled}>
      <Field.Label
        className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)}
        nativeLabel={false}
      >
        {label}
        {required ? <span className={styles.required}> *</span> : null}
      </Field.Label>
      <Select.Root
        items={options}
        value={value || null}
        onValueChange={(next) => onValueChange(next ?? "")}
        disabled={disabled}
      >
        <Select.Trigger className={styles.selectTrigger} aria-required={required || undefined}>
          <Select.Value className={styles.selectValue} placeholder={resolvedPlaceholder} />
          <Select.Icon>
            <Icon name="chevronDown" size={20} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className={styles.selectPositioner} sideOffset={compact ? 4 : 8}>
            <Select.Popup className={styles.selectPopup}>
              <Select.List>
                {options.map((option) => (
                  <Select.Item
                    className={styles.selectItem}
                    key={option.value}
                    value={option.value}
                  >
                    <Select.ItemIndicator className={styles.selectIndicator}>
                      <Icon name="check" size={18} />
                    </Select.ItemIndicator>
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {error ? <Field.Error className={styles.fieldError}>{error}</Field.Error> : null}
    </Field.Root>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        if (next[0]) onValueChange(next[0] as T);
      }}
      className={styles.segmented}
    >
      {options.map((option) => (
        <Toggle className={styles.segment} key={option.value} value={option.value}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export function ChoiceChipGroup<T extends string>({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value?: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value ? [value] : []}
      onValueChange={(next) => {
        if (next[0]) onValueChange(next[0] as T);
      }}
      className={styles.choiceGrid}
    >
      {options.map((option) => (
        <Toggle className={styles.choiceChip} key={option.value} value={option.value}>
          {option.icon}
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export function SwitchField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={styles.switchRow}>
      <span className={styles.switchCopy}>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <Switch.Root
        className={styles.switch}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      >
        <Switch.Thumb className={styles.switchThumb} />
      </Switch.Root>
    </label>
  );
}

export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={styles.checkboxRow}>
      <Checkbox.Root
        className={styles.checkbox}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      >
        <Checkbox.Indicator className={styles.checkboxIndicator}>
          <Icon name="check" size={17} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className={styles.checkboxCopy}>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function Disclosure({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root className={styles.collapsible} open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className={styles.collapsibleTrigger}>
        {label}
        <Icon className={styles.collapsibleChevron} name="chevronDown" size={20} />
      </Collapsible.Trigger>
      <Collapsible.Panel className={styles.collapsiblePanel}>
        <div className={styles.collapsibleContent}>{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function useCompact() {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 599px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 599px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

function useVirtualKeyboardOpen(enabled: boolean) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setKeyboardOpen(false);
      return undefined;
    }
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => {
      const visibleBottom = Math.min(
        window.innerHeight,
        Math.max(0, viewport.offsetTop) + viewport.height,
      );
      setKeyboardOpen(window.innerHeight - visibleBottom > 60);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);
  return keyboardOpen;
}

export function AdaptiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const { messages } = useI18n();
  const compact = useCompact();
  const keyboardOpen = useVirtualKeyboardOpen(open && compact);
  const intro = (
    <div>
      <h2 className={styles.modalTitle}>{title}</h2>
      {description ? <p className={styles.modalDescription}>{description}</p> : null}
    </div>
  );
  if (compact)
    return (
      <Drawer.Root open={open} onOpenChange={(next) => onOpenChange(next)} swipeDirection="down">
        <Drawer.VirtualKeyboardProvider>
          <Drawer.Portal>
            <Drawer.Backdrop className={styles.backdrop} />
            <Drawer.Viewport
              className={styles.drawerViewport}
              data-virtual-keyboard-open={keyboardOpen ? "" : undefined}
            >
              <Drawer.Popup className={styles.drawerPopup}>
                <div className={styles.drawerHandle} aria-hidden="true" />
                <div className={styles.modalHeader}>
                  <Drawer.Title render={<div />}>{intro}</Drawer.Title>
                  <Drawer.Close className={styles.iconButton} aria-label={messages.common.close}>
                    <Icon name="close" />
                  </Drawer.Close>
                </div>
                <Drawer.Content className={cx(styles.modalBody, styles.drawerBody)}>
                  {children}
                </Drawer.Content>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.VirtualKeyboardProvider>
      </Drawer.Root>
    );
  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Viewport className={styles.dialogViewport}>
          <Dialog.Popup className={styles.dialogPopup}>
            <div className={styles.modalHeader}>
              <Dialog.Title render={<div />}>{intro}</Dialog.Title>
              <Dialog.Close className={styles.iconButton} aria-label={messages.common.close}>
                <Icon name="close" />
              </Dialog.Close>
            </div>
            <div className={styles.modalBody}>{children}</div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type ActionMenuItem = {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

export function ActionMenu({ label, items }: { label?: string; items: ActionMenuItem[] }) {
  const { messages } = useI18n();
  const accessibleLabel = label ?? messages.common.moreActions;
  return (
    <Menu.Root>
      <Menu.Trigger className={styles.iconButton} aria-label={accessibleLabel}>
        <Icon name="more" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={styles.menuPositioner} sideOffset={6} align="end">
          <Menu.Popup className={styles.menuPopup}>
            {items.map((item, index) => (
              <Fragment key={`${item.label}-${index}`}>
                {item.separatorBefore ? <Menu.Separator className={styles.menuSeparator} /> : null}
                <Menu.Item
                  className={cx(styles.menuItem, item.danger && styles.menuItemDanger)}
                  disabled={item.disabled}
                  onClick={item.onSelect}
                >
                  {item.icon ? <Icon name={item.icon} size={20} /> : null}
                  {item.label}
                </Menu.Item>
              </Fragment>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function Card({
  variant = "outlined",
  padded = true,
  className,
  children,
}: {
  variant?: "filled" | "outlined" | "elevated";
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        styles.card,
        variant === "outlined" && styles.cardOutlined,
        variant === "elevated" && styles.cardElevated,
        padded && styles.cardPadding,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.chip, className)}>{children}</span>;
}
