import type { CSSProperties, HTMLAttributes } from "react";
import type { MaterialSymbol } from "@material-symbols/font-400";
import "@material-symbols/font-400/rounded.css";
import materialIconNamesText from "./material_icon_names.txt?raw";
import Add from "@material-symbols/svg-400/rounded/add.svg";
import Archive from "@material-symbols/svg-400/rounded/archive.svg";
import ArrowDown from "@material-symbols/svg-400/rounded/arrow_downward.svg";
import ArrowUp from "@material-symbols/svg-400/rounded/arrow_upward.svg";
import Calendar from "@material-symbols/svg-400/rounded/calendar_month.svg";
import Category from "@material-symbols/svg-400/rounded/category.svg";
import Check from "@material-symbols/svg-400/rounded/check.svg";
import ChevronDown from "@material-symbols/svg-400/rounded/keyboard_arrow_down.svg";
import ChevronLeft from "@material-symbols/svg-400/rounded/chevron_left.svg";
import ChevronRight from "@material-symbols/svg-400/rounded/chevron_right.svg";
import Close from "@material-symbols/svg-400/rounded/close.svg";
import DarkMode from "@material-symbols/svg-400/rounded/dark_mode.svg";
import Delete from "@material-symbols/svg-400/rounded/delete.svg";
import Devices from "@material-symbols/svg-400/rounded/devices.svg";
import Download from "@material-symbols/svg-400/rounded/download.svg";
import Edit from "@material-symbols/svg-400/rounded/edit.svg";
import ErrorIcon from "@material-symbols/svg-400/rounded/error.svg";
import Flight from "@material-symbols/svg-400/rounded/flight.svg";
import Food from "@material-symbols/svg-400/rounded/restaurant.svg";
import Gift from "@material-symbols/svg-400/rounded/redeem.svg";
import Health from "@material-symbols/svg-400/rounded/health_and_safety.svg";
import Home from "@material-symbols/svg-400/rounded/home.svg";
import Info from "@material-symbols/svg-400/rounded/info.svg";
import LightMode from "@material-symbols/svg-400/rounded/light_mode.svg";
import Location from "@material-symbols/svg-400/rounded/location_on.svg";
import Lock from "@material-symbols/svg-400/rounded/lock.svg";
import Logout from "@material-symbols/svg-400/rounded/logout.svg";
import More from "@material-symbols/svg-400/rounded/more_vert.svg";
import Movie from "@material-symbols/svg-400/rounded/movie.svg";
import Palette from "@material-symbols/svg-400/rounded/palette.svg";
import Payments from "@material-symbols/svg-400/rounded/payments.svg";
import Pets from "@material-symbols/svg-400/rounded/pets.svg";
import Repeat from "@material-symbols/svg-400/rounded/repeat.svg";
import Restore from "@material-symbols/svg-400/rounded/restore_from_trash.svg";
import Salary from "@material-symbols/svg-400/rounded/paid.svg";
import Savings from "@material-symbols/svg-400/rounded/savings.svg";
import School from "@material-symbols/svg-400/rounded/school.svg";
import Search from "@material-symbols/svg-400/rounded/search.svg";
import Security from "@material-symbols/svg-400/rounded/security.svg";
import Settings from "@material-symbols/svg-400/rounded/settings.svg";
import Shopping from "@material-symbols/svg-400/rounded/shopping_bag.svg";
import Subscription from "@material-symbols/svg-400/rounded/subscriptions.svg";
import Sync from "@material-symbols/svg-400/rounded/sync.svg";
import Today from "@material-symbols/svg-400/rounded/today.svg";
import Transport from "@material-symbols/svg-400/rounded/directions_bus.svg";
import Undo from "@material-symbols/svg-400/rounded/undo.svg";
import Utilities from "@material-symbols/svg-400/rounded/bolt.svg";
import Warning from "@material-symbols/svg-400/rounded/warning.svg";
import Work from "@material-symbols/svg-400/rounded/work.svg";

const iconComponents = {
  add: Add,
  archive: Archive,
  arrowDown: ArrowDown,
  arrowUp: ArrowUp,
  calendar: Calendar,
  category: Category,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: Close,
  darkMode: DarkMode,
  delete: Delete,
  devices: Devices,
  download: Download,
  edit: Edit,
  error: ErrorIcon,
  flight: Flight,
  food: Food,
  gift: Gift,
  health: Health,
  home: Home,
  info: Info,
  lightMode: LightMode,
  location: Location,
  lock: Lock,
  logout: Logout,
  more: More,
  movie: Movie,
  palette: Palette,
  payments: Payments,
  pets: Pets,
  repeat: Repeat,
  restore: Restore,
  salary: Salary,
  savings: Savings,
  school: School,
  search: Search,
  security: Security,
  settings: Settings,
  shopping: Shopping,
  subscription: Subscription,
  sync: Sync,
  today: Today,
  transport: Transport,
  undo: Undo,
  utilities: Utilities,
  warning: Warning,
  work: Work,
} satisfies Record<string, string>;

export type IconName = keyof typeof iconComponents;

type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  name: IconName;
  size?: number;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
};

export function Icon({
  name,
  size = 24,
  width,
  height,
  className = "",
  style,
  ...props
}: IconProps) {
  const source = iconComponents[name];
  return (
    <span
      aria-hidden="true"
      className={`material-symbol ${className}`}
      style={{
        display: "inline-block",
        width: width ?? size,
        height: height ?? size,
        flex: "0 0 auto",
        backgroundColor: "currentColor",
        maskImage: `url(${source})`,
        WebkitMaskImage: `url(${source})`,
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        ...style,
      }}
      {...props}
    />
  );
}

const categoryIcons: Record<string, MaterialSymbol> = {
  food: "restaurant",
  transport: "directions_bus",
  shopping: "shopping_bag",
  home: "home",
  entertainment: "movie",
  health: "health_and_safety",
  education: "school",
  subscription: "subscriptions",
  salary: "paid",
  bonus: "redeem",
  freelance: "work",
  interest: "savings",
  refund: "undo",
  gift: "redeem",
  travel: "flight",
  pets: "pets",
  utilities: "bolt",
  other: "category",
};

const materialIconNames = materialIconNamesText.trim().split("\n") as MaterialSymbol[];
const materialIconNameSet = new Set<string>(materialIconNames);

export type CategoryIconChoice = {
  value: string;
  label: string;
  keywords?: string;
  translationKey?: CategoryIconTranslationKey;
};

export type CategoryIconTranslationKey =
  | "default"
  | "food"
  | "transport"
  | "shopping"
  | "home"
  | "entertainment"
  | "health"
  | "education"
  | "subscription"
  | "salary"
  | "bonus"
  | "freelance"
  | "interest"
  | "refund"
  | "gift"
  | "travel"
  | "pets"
  | "utilities"
  | "other";

const preferredCategoryIconChoices = [
  { value: "", label: "default icon", translationKey: "default", keywords: "default category" },
  { value: "food", label: "food", translationKey: "food", keywords: "food meal restaurant" },
  {
    value: "transport",
    label: "transport",
    translationKey: "transport",
    keywords: "transport bus car transit",
  },
  {
    value: "shopping",
    label: "shopping",
    translationKey: "shopping",
    keywords: "shopping bag store",
  },
  { value: "home", label: "home", translationKey: "home", keywords: "home house" },
  {
    value: "entertainment",
    label: "entertainment",
    translationKey: "entertainment",
    keywords: "entertainment movie",
  },
  { value: "health", label: "health", translationKey: "health", keywords: "health medical safety" },
  {
    value: "education",
    label: "education",
    translationKey: "education",
    keywords: "education school",
  },
  {
    value: "subscription",
    label: "subscription",
    translationKey: "subscription",
    keywords: "subscription recurring",
  },
  { value: "salary", label: "salary", translationKey: "salary", keywords: "salary paid money" },
  { value: "bonus", label: "bonus", translationKey: "bonus", keywords: "bonus reward" },
  {
    value: "freelance",
    label: "freelance",
    translationKey: "freelance",
    keywords: "freelance work",
  },
  {
    value: "interest",
    label: "interest",
    translationKey: "interest",
    keywords: "interest savings",
  },
  { value: "refund", label: "refund", translationKey: "refund", keywords: "refund undo return" },
  { value: "gift", label: "gift", translationKey: "gift", keywords: "gift redeem present" },
  { value: "travel", label: "travel", translationKey: "travel", keywords: "travel flight trip" },
  { value: "pets", label: "pets", translationKey: "pets", keywords: "pets animal" },
  {
    value: "utilities",
    label: "utilities",
    translationKey: "utilities",
    keywords: "utilities power bolt",
  },
  { value: "other", label: "other", translationKey: "other", keywords: "other category" },
] satisfies CategoryIconChoice[];

const preferredValues = new Set(preferredCategoryIconChoices.map(({ value }) => value));

export const categoryIconChoices: CategoryIconChoice[] = [
  ...preferredCategoryIconChoices,
  ...materialIconNames
    .filter((name) => !preferredValues.has(name))
    .map((name) => ({
      value: name,
      label: name.replaceAll("_", " "),
      keywords: name,
    })),
];

export function CategoryIcon({ iconKey, ...props }: Omit<IconProps, "name"> & { iconKey: string }) {
  const { size = 24, width, height, className = "", style, ...spanProps } = props;
  const iconName =
    categoryIcons[iconKey] ??
    (materialIconNameSet.has(iconKey) ? (iconKey as MaterialSymbol) : "category");
  const iconWidth = width ?? size;
  const iconHeight = height ?? size;
  const numericWidth = typeof iconWidth === "number" ? iconWidth : size;
  const numericHeight = typeof iconHeight === "number" ? iconHeight : size;

  return (
    <span
      aria-hidden="true"
      className={`material-symbols-rounded ${className}`}
      style={{
        display: "inline-flex",
        width: iconWidth,
        height: iconHeight,
        flex: "0 0 auto",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontSize: Math.min(numericWidth, numericHeight),
        fontVariationSettings: "'FILL' 0",
        ...style,
      }}
      {...spanProps}
    >
      {iconName}
    </span>
  );
}
