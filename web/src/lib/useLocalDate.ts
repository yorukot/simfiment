import { useEffect, useState } from "react";
import { todayInTimezone } from "./date";

// Re-evaluate on foregrounding and across midnight without reloading a draft.
export function useLocalDate(timezone: string) {
  const [date, setDate] = useState(() => todayInTimezone(timezone));
  useEffect(() => {
    const update = () => setDate(todayInTimezone(timezone));
    update();
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [timezone]);
  return date;
}
