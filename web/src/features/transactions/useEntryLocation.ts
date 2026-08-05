import { useEffect, useRef, useState } from "react";
import type { EntryLocation } from "../../api/types";

export type CaptureFailureReason =
  "permission_denied" | "position_unavailable" | "timeout" | "unsupported" | "unknown";
export type CaptureResult =
  { ok: true; location: EntryLocation } | { ok: false; reason: CaptureFailureReason };
export type CaptureStatus = "off" | "finding" | "ready" | "permission_denied" | "unavailable";

function capture(): Promise<CaptureResult> {
  if (!("geolocation" in navigator)) return Promise.resolve({ ok: false, reason: "unsupported" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            ...(Number.isFinite(position.coords.accuracy)
              ? { accuracyM: position.coords.accuracy }
              : {}),
            capturedAt: new Date(position.timestamp).toISOString(),
          },
        }),
      (error) =>
        resolve({
          ok: false,
          reason:
            error.code === 1
              ? "permission_denied"
              : error.code === 2
                ? "position_unavailable"
                : error.code === 3
                  ? "timeout"
                  : "unknown",
        }),
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 60_000 },
    );
  });
}

export function useEntryLocation(enabled: boolean) {
  const [status, setStatus] = useState<CaptureStatus>(enabled ? "finding" : "off");
  const [location, setLocation] = useState<EntryLocation>();
  const promiseRef = useRef<Promise<CaptureResult>>(
    Promise.resolve({ ok: false, reason: "unsupported" }),
  );
  useEffect(() => {
    let active = true;
    if (!enabled) {
      setStatus("off");
      setLocation(undefined);
      promiseRef.current = Promise.resolve({ ok: false, reason: "unsupported" });
      return;
    }
    setStatus("finding");
    setLocation(undefined);
    const promise = capture();
    promiseRef.current = promise;
    void promise.then((result) => {
      if (!active) return;
      if (result.ok) {
        setLocation(result.location);
        setStatus("ready");
      } else {
        setStatus(result.reason === "permission_denied" ? "permission_denied" : "unavailable");
      }
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  return { status, location, capturePromise: promiseRef };
}
