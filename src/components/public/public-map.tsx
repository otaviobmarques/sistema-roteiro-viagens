"use client";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/trip-map";

const TripMap = dynamic(() => import("@/components/trip-map").then((m) => m.TripMap), { ssr: false, loading: () => <div className="card h-[380px] animate-pulse" /> });

export function PublicMap({ points }: { points: MapPoint[] }) {
  if (!points.length) return null;
  return <TripMap points={points} route={false} height={380} />;
}
