import type { EntryLocation } from "../../api/types";
import styles from "../../styles/ui.module.css";

const MAP_SPAN_DEGREES = 0.004;

export function openStreetMapURLs(location: EntryLocation) {
  const latitude = location.latitude;
  const longitude = location.longitude;
  const bbox = [
    longitude - MAP_SPAN_DEGREES,
    latitude - MAP_SPAN_DEGREES,
    longitude + MAP_SPAN_DEGREES,
    latitude + MAP_SPAN_DEGREES,
  ]
    .map((coordinate) => coordinate.toFixed(6))
    .join(",");
  const marker = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  const embed = new URL("https://www.openstreetmap.org/export/embed.html");
  embed.searchParams.set("bbox", bbox);
  embed.searchParams.set("layer", "mapnik");
  embed.searchParams.set("marker", marker);

  return {
    embed: embed.toString(),
    details: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=17/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`,
  };
}

export function OpenStreetMapLocation({ location }: { location: EntryLocation }) {
  const urls = openStreetMapURLs(location);
  return (
    <section className={styles.locationMap} aria-labelledby="transaction-location-map-title">
      <div className={styles.locationMapHeader}>
        <div>
          <strong id="transaction-location-map-title">輸入位置地圖</strong>
          <span>標記為記帳當下的位置</span>
        </div>
        <a href={urls.details} target="_blank" rel="noreferrer">
          在 OpenStreetMap 開啟 <span aria-hidden="true">↗</span>
        </a>
      </div>
      <iframe
        className={styles.locationMapFrame}
        src={urls.embed}
        title="交易輸入位置的 OpenStreetMap 地圖"
        loading="lazy"
      />
      <p className={styles.mapAttribution}>
        地圖資料 ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap 貢獻者
        </a>
      </p>
    </section>
  );
}
