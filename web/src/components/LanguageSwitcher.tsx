import { useI18n } from "../i18n";
import { SegmentedControl } from "./ui";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, messages } = useI18n();
  return (
    <div className={className}>
      <SegmentedControl
        label={messages.language.label}
        value={locale}
        onValueChange={setLocale}
        options={[
          { value: "zh-TW", label: messages.language.traditionalChinese },
          { value: "en", label: messages.language.english },
        ]}
      />
    </div>
  );
}
