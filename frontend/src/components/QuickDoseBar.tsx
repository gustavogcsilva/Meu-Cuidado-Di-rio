import { useState } from "react";
import { Check, CheckCircle2, Droplets, Pill, Syringe, Zap } from "lucide-react";
import { formatDoseLabel } from "../services/api";
import type { Medication, MedicationUnit } from "../types/medication";

interface QuickDoseBarProps {
  medications: Medication[];
  onTakeDose: (med: Medication) => Promise<void>;
}

export function getMedicationPresentationIcon(unidade?: MedicationUnit, nome = "") {
  const norm = (nome + " " + (unidade || "")).toLowerCase();
  if (norm.includes("injet") || norm.includes("ampola") || norm.includes("insulina")) {
    return <Syringe size={18} className="shrink-0" />;
  }
  if (
    unidade === "gotas" ||
    unidade === "ml" ||
    norm.includes("gotas") ||
    norm.includes("xarope") ||
    norm.includes("solucao")
  ) {
    return <Droplets size={18} className="shrink-0" />;
  }
  return <Pill size={18} className="shrink-0" />;
}

export function QuickDoseBar({ medications, onTakeDose }: QuickDoseBarProps) {
  const [takingId, setTakingId] = useState<number | null>(null);
  const [justTakenId, setJustTakenId] = useState<number | null>(null);

  const activeMeds = medications.filter((m) => m.ativo);

  if (activeMeds.length === 0) return null;

  async function handleQuickClick(med: Medication) {
    if (!med.id || med.estoqueAtual <= 0 || takingId === med.id) return;
    setTakingId(med.id);
    try {
      await onTakeDose(med);
      setJustTakenId(med.id);
      window.setTimeout(() => {
        setJustTakenId(null);
      }, 2500);
    } finally {
      setTakingId(null);
    }
  }

  return (
    <section
      className="mb-6 rounded-3xl border-2 border-emerald-500/25 bg-linear-to-r from-emerald-50 via-white to-mint/40 p-4 shadow-card sm:p-5"
      aria-label="Acesso Rápido para Tomada de Dose"
      data-testid="quick-dose-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-950/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-forest text-white shadow-2xs">
            <Zap size={18} className="fill-amber-300 text-amber-300" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-forest sm:text-base">
              ⚡ Tomar Agora (Acesso Rápido — Zero Busca)
            </h2>
            <p className="text-xs text-muted">
              Clique no botão da sua medicação para registrar a dose tomada e dar baixa no estoque instantaneamente.
            </p>
          </div>
        </div>

        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-forest">
          1 Clique = Baixa no Estoque
        </span>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {activeMeds.map((med) => {
          const doseFormatted = formatDoseLabel(
            med.quantidadePorDose || 1,
            med.unidade || "comprimido",
          );
          const isTaking = takingId === med.id;
          const isJustTaken = justTakenId === med.id;
          const outOfStock = med.estoqueAtual <= 0;

          return (
            <button
              key={med.id}
              type="button"
              disabled={isTaking || outOfStock}
              onClick={() => void handleQuickClick(med)}
              data-testid={`quick-dose-btn-${med.nome.toLowerCase()}`}
              className={`group inline-flex min-h-12 items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left text-xs font-bold transition sm:text-sm ${
                isJustTaken
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300"
                  : outOfStock
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
                    : "border-emerald-900/15 bg-white text-ink shadow-sm hover:border-forest hover:bg-mint/40 hover:shadow-md"
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
                  isJustTaken
                    ? "bg-white text-emerald-700"
                    : "bg-mint text-forest group-hover:bg-forest group-hover:text-white"
                }`}
              >
                {isJustTaken ? (
                  <CheckCircle2 size={19} className="animate-bounce" />
                ) : (
                  getMedicationPresentationIcon(med.unidade, med.nome)
                )}
              </span>

              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold sm:text-base">
                    {med.nome}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                    {med.dosagem}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-600">
                  {isJustTaken ? (
                    <span className="font-extrabold text-white">✅ Dose Registrada!</span>
                  ) : outOfStock ? (
                    <span className="text-rose-600 font-bold">Sem estoque</span>
                  ) : (
                    <>
                      Tomar {doseFormatted} • Restam <strong>{med.estoqueAtual} {med.unidade}</strong>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
