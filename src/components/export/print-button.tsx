"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return <button className="btn-primary btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimir / PDF</button>;
}
