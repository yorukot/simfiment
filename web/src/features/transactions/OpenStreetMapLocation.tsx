import type { EntryLocation } from "../../api/types";
import styles from "../../styles/ui.module.css";
import { useI18n } from "../../i18n";

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
  const { messages } = useI18n();
  const urls = openStreetMapURLs(location);
  return (
    <section className={styles.locationMap} aria-labelledby="transaction-location-map-title">
      <div className={styles.locationMapHeader}>
        <div>
          <strong id="transaction-location-map-title">{messages.map.title}</strong>
          <span>{messages.map.description}</span>
        </div>
        <a href={urls.details} target="_blank" rel="noreferrer">
          {messages.map.open} <span aria-hidden="true">↗</span>
        </a>
      </div>
      <iframe
        className={styles.locationMapFrame}
        src={urls.embed}
        title={messages.map.frameTitle}
        loading="lazy"
      />
      <p className={styles.mapAttribution}>
        {messages.map.attribution}{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          {messages.map.contributors}
        </a>
      </p>
    </section>
  );
}
