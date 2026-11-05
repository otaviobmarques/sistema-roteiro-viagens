"use client";
// Mapa com MapLibre GL + tiles abertos do OpenStreetMap (OpenFreeMap). Só dados próprios (seção 10.6).
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// O worker do MapLibre é servido como arquivo estático (o bundler não consegue embuti-lo)
if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type MapPoint = { id: string; lat: number; lng: number; label?: string; title: string; tone?: "blue" | "teal" | "navy" | "warn" | "gray"; big?: boolean };

const TONES = { blue: "#205BFF", teal: "#11C2C8", navy: "#0A1F4C", warn: "#F59E0B", gray: "#8A92A6" };

export function TripMap({ points, route = true, className, onSelect, selectedId, height = 420 }: {
  points: MapPoint[];
  route?: boolean;
  className?: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  height?: number | string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const ready = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = new maplibregl.Map({
      container: el.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: points[0] ? [points[0].lng, points[0].lat] : [-46.63, -23.55],
      zoom: points.length ? 12 : 3,
      attributionControl: { compact: true },
    });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current.on("load", () => { ready.current = true; draw(); });
    return () => { map.current?.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    valid.forEach((p) => {
      const div = document.createElement("button");
      const size = p.big ? 34 : 26;
      const color = TONES[p.tone ?? "blue"];
      const selected = p.id === selectedId;
      div.type = "button";
      div.setAttribute("aria-label", p.title);
      div.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;background:${color};color:#fff;font:600 12px var(--font-mono),monospace;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 12px rgba(10,31,76,.25);cursor:pointer;${selected ? "outline:3px solid rgba(32,91,255,.35);" : ""}`;
      div.textContent = p.label ?? "";
      div.onclick = () => onSelect?.(p.id);
      const mk = new maplibregl.Marker({ element: div }).setLngLat([p.lng, p.lat]).setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setText(p.title)).addTo(m);
      markers.current.push(mk);
    });
    const coords = valid.map((p) => [p.lng, p.lat]);
    const src = m.getSource("route") as maplibregl.GeoJSONSource | undefined;
    const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: route ? coords : [] } };
    if (src) src.setData(data);
    else {
      m.addSource("route", { type: "geojson", data });
      m.addLayer({ id: "route-glow", type: "line", source: "route", paint: { "line-color": "#11C2C8", "line-width": 8, "line-opacity": 0.25 } });
      m.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#205BFF", "line-width": 3, "line-dasharray": [2, 1.5] } });
    }
    if (valid.length === 1) m.flyTo({ center: [valid[0].lng, valid[0].lat], zoom: 13, duration: 600 });
    else if (valid.length > 1) {
      const b = new maplibregl.LngLatBounds();
      valid.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 60, maxZoom: 15, duration: 600 });
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { draw(); }, [JSON.stringify(points), selectedId, route]);

  return <div ref={el} className={className} style={{ height, width: "100%", borderRadius: 18, overflow: "hidden" }} role="region" aria-label="Mapa" />;
}
