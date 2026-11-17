import { useEffect, useState } from "react";
import {
  AlarmClock,
  CheckCircle2,
  Clock,
  Moon,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  calculateIntervalSchedule,
  formatDoseLabel,
  formatIntervalSummary,
  isSleepHourSlot,
} from "../services/api";
import type { Medication } from "../types/medication";

interface ScheduleConfirmationModalProps {
  draft: Medication | null;
  profileName: string;
  isEditingExisting: boolean;
  onConfirm: (confirmedMed: Medication) => Promise<void>;
  onCancel: () => void;
}

const INTERVAL_OPTIONS = [4, 6, 8, 12, 24];

export function ScheduleConfirmationModal({
  draft,
  profileName,
  isEditingExisting,
  onConfirm,
  onCancel,
}: ScheduleConfirmationModalProps) {
  const [intervaloHoras, setIntervaloHoras] = useState<number>(8);
  const [horaInicial, setHoraInicial] = useState<string>("08:00");
  const [horarios, setHorarios] = useState<string[]>(["08:00", "16:00", "00:00"]);
  const [duracaoDias, setDuracaoDias] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setIntervaloHoras(draft.intervaloHoras || 8);
    const initialList =
      draft.horarios && draft.horarios.length > 0
        ? [...draft.horarios]
        : calculateIntervalSchedule("08:00", draft.intervaloHoras || 8);
    setHoraInicial(initialList[0] ?? "08:00");
    setHorarios(initialList);
    setDuracaoDias(draft.duracaoDias ?? 5);
  }, [draft]);

  if (!draft) return null;

  function handleChangeIntervalOrStart(newInterval: number, newStart: string) {
    setIntervaloHoras(newInterval);
    setHoraInicial(newStart);
    setHorarios(calculateIntervalSchedule(newStart, newInterval));
  }

  function handleUpdateSingleSlot(index: number, newValue: string) {
    setHorarios((prev) => prev.map((h, i) => (i === index ? newValue : h)));
  }

  function handleAdjustSleepCollision(index: number) {
    setHorarios((prev) => prev.map((h, i) => (i === index ? "23:00" : h)));
  }

  function handleAddExtraSlot() {
    setHorarios((prev) => [...prev, "22:00"]);
  }

  function handleRemoveSlot(index: number) {
    if (horarios.length <= 1) return;
    setHorarios((prev) => prev.filter((_, i) => i !== index));
  }

  const dosesPerDay = horarios.length;
  const totalDays = draft.tipo === "temporario" ? Math.max(1, duracaoDias) : 30;
  const totalDosesCycle = dosesPerDay * totalDays;
  const totalUnitsNeeded = totalDosesCycle * (draft.quantidadePorDose || 1);
  const doseText = formatDoseLabel(draft.quantidadePorDose || 1, draft.unidade || "comprimido");

  async function handleConfirmClick() {
    if (!draft) return;
    setIsSubmitting(true);
    try {
      await onConfirm({
        ...draft,
        intervaloHoras,
        horarios: [...horarios],
        duracaoDias: draft.tipo === "temporario" ? Math.max(1, duracaoDias) : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-confirm-title"
      data-testid="schedule-confirmation-modal"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-emerald-900/15 bg-white p-5 shadow-2xl sm:p-7">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-forest text-white shadow-sm">
              <AlarmClock size={23} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-forest">
                  {isEditingExisting ? "Edição de Posologia e Horários" : "Confirmação Obrigatória de Horários"}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  Perfil: [{profileName}]
                </span>
              </div>
              <h2 id="schedule-confirm-title" className="mt-1.5 text-xl font-bold text-ink sm:text-2xl">
                {draft.nome} <span className="text-forest">{draft.dosagem}</span> ({doseText})
              </h2>
              <p className="text-xs text-muted">
                Confira e ajuste os horários calculados antes de gravar no calendário e recalcular o estoque.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cancelar confirmação"
          >
            <X size={20} />
          </button>
        </div>

        {/* Banner Explícito de Intervalo e Duração */}
        <div
          className="mt-4 rounded-2xl border-2 border-forest/25 bg-mint/55 p-4"
          data-testid="schedule-explicit-summary"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-forest">
            Regra Posológica Calculada
          </p>
          <p className="mt-1 text-base font-extrabold text-ink sm:text-lg">
            {formatIntervalSummary(
              intervaloHoras,
              draft.tipo,
              draft.tipo === "temporario" ? duracaoDias : undefined,
            )}
          </p>
          <p className="mt-1 text-xs text-slate-700">
             Prévia: <strong>{horarios.join(" • ")}</strong>{" "}
            {draft.tipo === "temporario" ? (
              <>
                durante <strong>{duracaoDias} dias</strong> ={" "}
                <strong>
                  {totalDosesCycle} doses totais ({formatDoseLabel(totalUnitsNeeded, draft.unidade)})
                </strong>
              </>
            ) : (
              <>
                • Uso Contínuo ={" "}
                <strong>
                  {totalDosesCycle} doses a cada 30 dias ({formatDoseLabel(totalUnitsNeeded, draft.unidade)}/mês)
                </strong>
              </>
            )}
          </p>
        </div>

        {/* Controles rápidos de Intervalo (X em X horas), Hora Inicial e Duração */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold text-slate-700">
              Intervalo (De X em X horas)
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleChangeIntervalOrStart(opt, horaInicial)}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                    intervaloHoras === opt
                      ? "bg-forest text-white shadow-2xs"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-mint"
                  }`}
                  data-testid={`interval-option-${opt}h`}
                >
                  {opt}/{opt}h
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">
              Horário da 1ª Tomada
            </label>
            <input
              type="time"
              value={horaInicial}
              onChange={(e) => handleChangeIntervalOrStart(intervaloHoras, e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-mono font-bold"
              data-testid="schedule-start-time-input"
            />
          </div>

          {draft.tipo === "temporario" && (
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Duração (Durante Y dias)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={duracaoDias}
                onChange={(e) => setDuracaoDias(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-bold"
                data-testid="schedule-duration-days-input"
              />
            </div>
          )}
        </div>

        {/* Lista Interativa dos Horários Calculados com Detector de Colisão de Sono */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">
              Horários Diários ({horarios.length}x ao dia) — Ajuste se colidir com o sono
            </h3>
            <button
              type="button"
              onClick={handleAddExtraSlot}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus size={13} /> Adicionar horário
            </button>
          </div>

          <div className="mt-2.5 space-y-2">
            {horarios.map((h, idx) => {
              const sleepCollision = isSleepHourSlot(h);
              return (
                <div
                  key={idx}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 ${
                    sleepCollision
                      ? "border-amber-300 bg-amber-50/90"
                      : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-white font-mono text-xs font-bold text-forest shadow-2xs">
                      {idx + 1}ª
                    </span>
                    <input
                      type="time"
                      value={h}
                      onChange={(e) => handleUpdateSingleSlot(idx, e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm font-bold text-ink"
                      data-testid={`schedule-slot-input-${idx}`}
                    />
                    <span className="text-xs font-medium text-slate-600">
                      — {doseText} de {draft.nome}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {sleepCollision && (
                      <button
                        type="button"
                        onClick={() => handleAdjustSleepCollision(idx)}
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-amber-600"
                        data-testid={`adjust-sleep-slot-btn-${idx}`}
                      >
                        <Moon size={13} />
                        Ajustar {h} → 23:00 (Sono)
                      </button>
                    )}
                    {horarios.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(idx)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Remover este horário"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo de Autonomia do Estoque */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-100/80 px-4 py-3 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-forest" />
            <span>
              Estoque informado: <strong>{formatDoseLabel(draft.estoqueAtual, draft.unidade)}</strong>{" "}
              • Autonomia para{" "}
              <strong>
                {Math.floor(
                  draft.estoqueAtual / Math.max(0.1, dosesPerDay * (draft.quantidadePorDose || 1)),
                )}{" "}
                dias
              </strong>
            </span>
          </div>
          <span className="font-semibold text-forest">
            Exportação .ICS prefixada: 💊 [{profileName}]
          </span>
        </div>

        {/* Rodapé de Confirmação */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Voltar e Ajustar Dados
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleConfirmClick()}
            className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-900 disabled:opacity-60"
            data-testid="confirm-schedule-save-btn"
          >
            <CheckCircle2 size={18} />
            ✅ Confirmar Horários e Atualizar Calendário
          </button>
        </div>
      </div>
    </div>
  );
}
