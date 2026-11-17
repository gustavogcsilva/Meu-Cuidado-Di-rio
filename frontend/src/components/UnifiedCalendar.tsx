import { useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Info,
  Stethoscope,
} from "lucide-react";
import {
  getDefaultMedicationColor,
  getMedicationAcronym,
} from "../db/database";
import { TRIMESTRAL_ALERT_TEXT, formatDoseLabel } from "../services/api";
import type { Medication, PatientProfile } from "../types/medication";

interface UnifiedCalendarProps {
  medications: Medication[];
  profiles: PatientProfile[];
  selectedDate: string;
  onSelectDate: (isoDate: string) => void;
  onExportIcs: () => void;
}

interface UniqueMedInDay {
  med: Medication;
  acronym: string;
  color: string;
  horariosNoDia: string[];
  perfilNome: string;
}

interface DayEvents {
  isoDate: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  doses: { med: Medication; horario: string; perfilNome: string; acronym: string; color: string }[];
  uniqueMeds: UniqueMedInDay[];
  endingMeds: { med: Medication; perfilNome: string }[];
  milestone90dMeds: { med: Medication; cycleDays: number; perfilNome: string }[];
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffDaysBetween(startIso: string, targetIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${targetIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function UnifiedCalendar({
  medications,
  profiles,
  selectedDate,
  onSelectDate,
  onExportIcs,
}: UnifiedCalendarProps) {
  const todayIso = toIsoDate(new Date());
  const [hoveredDayIso, setHoveredDayIso] = useState<string | null>(null);
  const [viewMonthDate, setViewMonthDate] = useState<Date>(() => {
    const base = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const profileNameMap = useMemo(() => {
    const m = new Map<number, string>();
    profiles.forEach((p) => {
      if (p.id !== undefined) m.set(p.id, p.nome);
    });
    return m;
  }, [profiles]);

  const activeMeds = useMemo(
    () => medications.filter((m) => m.ativo),
    [medications],
  );

  // Legenda de siglas e cores exclusivas dos medicamentos ativos
  const activeMedLegend = useMemo(() => {
    return activeMeds.map((med, idx) => ({
      id: med.id ?? idx,
      nome: med.nome,
      dosagem: med.dosagem,
      acronym: getMedicationAcronym(med.nome),
      color: med.corIdentificacao || getDefaultMedicationColor(med.nome, idx),
      horarios: med.horarios,
      perfilNome: profileNameMap.get(med.profileId) ?? "Eu",
    }));
  }, [activeMeds, profileNameMap]);

  const next90DayMilestone = useMemo(() => {
    const continuous = activeMeds.filter(
      (m) => m.tipo === "continuo" || m.origemPrescricao === "especializado",
    );
    if (continuous.length === 0) return null;
    const med = continuous[0];
    const d = new Date(`${med.dataInicio}T12:00:00`);
    d.setDate(d.getDate() + 90);
    return {
      med,
      perfilNome: profileNameMap.get(med.profileId) ?? "Eu",
      isoDate: toIsoDate(d),
      formatted: d.toLocaleDateString("pt-BR"),
    };
  }, [activeMeds, profileNameMap]);

  const calendarDays = useMemo<DayEvents[]>(() => {
    const year = viewMonthDate.getFullYear();
    const month = viewMonthDate.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const cells: DayEvents[] = [];
    const startOffset = firstDayOfWeek;

    for (let i = -startOffset + 1; i <= 42 - startOffset; i++) {
      const cellDate = new Date(year, month, i, 12, 0, 0);
      const iso = toIsoDate(cellDate);
      const isCurrentMonth = cellDate.getMonth() === month;

      const doses: {
        med: Medication;
        horario: string;
        perfilNome: string;
        acronym: string;
        color: string;
      }[] = [];
      const uniqueMap = new Map<string, UniqueMedInDay>();
      const endingMeds: { med: Medication; perfilNome: string }[] = [];
      const milestone90dMeds: { med: Medication; cycleDays: number; perfilNome: string }[] = [];

      activeMeds.forEach((med, idx) => {
        const diff = diffDaysBetween(med.dataInicio, iso);
        if (diff < 0) return;

        const perfilNome = profileNameMap.get(med.profileId) ?? "Eu";
        const acronym = getMedicationAcronym(med.nome);
        const color = med.corIdentificacao || getDefaultMedicationColor(med.nome, idx);
        const medKey = `${med.id ?? idx}-${med.nome}`;

        if (med.tipo === "temporario" && med.duracaoDias) {
          if (diff < med.duracaoDias) {
            med.horarios.forEach((h) =>
              doses.push({ med, horario: h, perfilNome, acronym, color }),
            );
            uniqueMap.set(medKey, {
              med,
              acronym,
              color,
              horariosNoDia: [...med.horarios],
              perfilNome,
            });
          }
          if (diff === med.duracaoDias - 1) {
            endingMeds.push({ med, perfilNome });
          }
        } else {
          med.horarios.forEach((h) =>
            doses.push({ med, horario: h, perfilNome, acronym, color }),
          );
          uniqueMap.set(medKey, {
            med,
            acronym,
            color,
            horariosNoDia: [...med.horarios],
            perfilNome,
          });
          if (
            (med.tipo === "continuo" || med.origemPrescricao === "especializado") &&
            diff > 0 &&
            diff % 90 === 0
          ) {
            milestone90dMeds.push({ med, cycleDays: diff, perfilNome });
          }
        }
      });

      doses.sort((a, b) => a.horario.localeCompare(b.horario));

      cells.push({
        isoDate: iso,
        dayNumber: cellDate.getDate(),
        isCurrentMonth,
        isToday: iso === todayIso,
        doses,
        uniqueMeds: Array.from(uniqueMap.values()),
        endingMeds,
        milestone90dMeds,
      });
    }

    return cells;
  }, [viewMonthDate, activeMeds, todayIso, profileNameMap]);

  const selectedDayDetails = useMemo(() => {
    const existing = calendarDays.find((d) => d.isoDate === selectedDate);
    if (existing) return existing;
    return calendarDays[0];
  }, [calendarDays, selectedDate]);

  function handlePrevMonth() {
    setViewMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    setViewMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  function handleGoToday() {
    const now = new Date();
    setViewMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    onSelectDate(todayIso);
  }

  function handleJumpTo90DayMilestone() {
    if (!next90DayMilestone) return;
    const d = new Date(`${next90DayMilestone.isoDate}T12:00:00`);
    setViewMonthDate(new Date(d.getFullYear(), d.getMonth(), 1));
    onSelectDate(next90DayMilestone.isoDate);
  }

  const monthTitle = viewMonthDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <section
      className="rounded-3xl border border-emerald-950/10 bg-white p-4 shadow-card sm:p-6"
      aria-labelledby="unified-calendar-heading"
      data-testid="unified-calendar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-mint text-forest">
            <CalendarIcon size={20} />
          </span>
          <div>
            <h2 id="unified-calendar-heading" className="text-lg font-bold tracking-tight text-ink">
              Calendário Inteligente por Siglas e Cores
            </h2>
            <p className="text-xs text-muted">
              Siglas de 3 letras (ex: GAR, ESC, DIP) com cores exclusivas e resumo ao clicar/passar o mouse
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onExportIcs}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-mint/60 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-mint"
          data-testid="export-ics-btn"
          title="Exportar lembretes prefixados com [Perfil] para Google Calendar / Apple Calendar (.ics)"
        >
          <Download size={14} />
          Exportar .ICS
        </button>
      </div>

      {/* Legenda de Cores e Siglas de 3 Letras das Medicações Ativas */}
      {activeMedLegend.length > 0 && (
        <div
          className="mt-3.5 rounded-2xl border border-slate-100 bg-slate-50/80 p-3"
          data-testid="calendar-acronym-legend"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
            Legenda de Siglas (3 Letras) & Cores Exclusivas:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeMedLegend.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1 text-xs shadow-2xs"
              >
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-white"
                  style={{ backgroundColor: item.color }}
                >
                  {item.acronym}
                </span>
                <span className="font-bold text-ink">{item.nome}</span>
                <span className="text-muted">({item.dosagem})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controles de navegação do mês e atalho para o marco de 90 dias */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="rounded-xl border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="min-w-36 text-center text-sm font-bold capitalize text-ink">
            {monthTitle}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="rounded-xl border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50"
            aria-label="Próximo mês"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleGoToday}
            className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Hoje
          </button>
          {next90DayMilestone && (
            <button
              type="button"
              onClick={handleJumpTo90DayMilestone}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 transition hover:bg-amber-200"
              data-testid="jump-90d-milestone-btn"
              title={`Saltar para o marco de 90 dias de [${next90DayMilestone.perfilNome}] ${next90DayMilestone.med.nome}`}
            >
              <Stethoscope size={13} />
              Ver Marco 90d ({next90DayMilestone.formatted})
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-muted">
        {weekDays.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grade Mensal com Siglas de 3 Letras (GAR, ESC, DIP) e Cores Distintas */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day) => {
          const isSelected = day.isoDate === selectedDate;
          const isHovered = day.isoDate === hoveredDayIso;
          const has90d = day.milestone90dMeds.length > 0;
          const hasEnding = day.endingMeds.length > 0;
          const tooltipText = day.uniqueMeds
            .map(
              (u) =>
                `[${u.acronym}] ${u.med.nome} (${u.med.dosagem}) — Horários: ${u.horariosNoDia.join(
                  ", ",
                )}`,
            )
            .join("\n");

          return (
            <div
              key={day.isoDate}
              className="relative"
              onMouseEnter={() => setHoveredDayIso(day.isoDate)}
              onMouseLeave={() => setHoveredDayIso(null)}
            >
              <button
                type="button"
                onClick={() => onSelectDate(day.isoDate)}
                title={tooltipText || undefined}
                data-testid={`calendar-day-${day.isoDate}`}
                className={`relative flex min-h-15 w-full flex-col items-center justify-between rounded-xl border p-1 text-xs transition sm:min-h-16 ${
                  isSelected
                    ? "border-forest bg-emerald-950/90 text-white shadow-sm ring-2 ring-forest/40"
                    : has90d
                      ? "border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100"
                      : day.isToday
                        ? "border-emerald-500 bg-mint/60 font-bold text-forest"
                        : day.isCurrentMonth
                          ? "border-slate-100 bg-slate-50/70 text-ink hover:bg-mint/30"
                          : "border-transparent bg-transparent text-slate-400"
                }`}
              >
                <div className="flex w-full items-center justify-between px-0.5">
                  <span className="text-[11px] font-bold">{day.dayNumber}</span>
                  {has90d && (
                    <span
                      className="rounded bg-amber-500 px-1 text-[8px] font-extrabold text-white"
                      title="Marco de 90 dias (3 meses)"
                    >
                      90d
                    </span>
                  )}
                  {hasEnding && !has90d && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-rose-500"
                      title="Fim de tratamento temporário"
                    />
                  )}
                </div>

                {/* Renderização das Badges Coloridas no Dia */}
                <div className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
                  {day.uniqueMeds.length === 1 ? (
                    <span
                      className="max-w-full truncate rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold text-white shadow-2xs"
                      style={{ backgroundColor: day.uniqueMeds[0].color }}
                    >
                      {day.uniqueMeds[0].acronym}
                    </span>
                  ) : (
                    day.uniqueMeds.slice(0, 4).map((u) => (
                      <span
                        key={`${day.isoDate}-${u.med.id ?? u.med.nome}`}
                        className="rounded px-1 py-0.5 font-mono text-[9px] font-extrabold leading-none text-white shadow-2xs"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.acronym}
                      </span>
                    ))
                  )}
                  {day.uniqueMeds.length > 4 && (
                    <span className="rounded bg-slate-700 px-1 text-[8px] font-bold text-white">
                      +{day.uniqueMeds.length - 4}
                    </span>
                  )}
                </div>
              </button>

              {/* Tooltip Flutuante no Hover (Desktop) */}
              {isHovered && day.uniqueMeds.length > 0 && (
                <div
                  className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 hidden w-56 -translate-x-1/2 rounded-2xl border border-slate-200 bg-slate-900/95 p-2.5 text-[11px] text-white shadow-xl sm:block"
                  role="tooltip"
                >
                  <p className="border-b border-white/15 pb-1 font-bold text-emerald-300">
                    📅 {new Date(`${day.isoDate}T12:00:00`).toLocaleDateString("pt-BR")}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {day.uniqueMeds.map((u) => (
                      <li
                        key={u.med.id ?? u.med.nome}
                        className="flex items-center justify-between gap-1.5"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className="rounded px-1 py-0.2 font-mono text-[9px] font-extrabold text-white"
                            style={{ backgroundColor: u.color }}
                          >
                            {u.acronym}
                          </span>
                          <span className="truncate font-semibold">{u.med.nome}</span>
                          <span className="text-slate-300">{u.med.dosagem}</span>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-emerald-300">
                          {u.horariosNoDia.join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resumo Expandido do Dia Selecionado (Toque no Mobile / Clique no Desktop) */}
      <div
        className="mt-4 rounded-2xl border border-slate-200/80 bg-canvas/90 p-3.5 sm:p-4"
        data-testid="calendar-selected-day-summary"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-forest">
            <Info size={14} />
            Resumo Expandido de{" "}
            {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </h3>
          {selectedDate === todayIso && (
            <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold text-forest">
              Hoje
            </span>
          )}
        </div>

        {selectedDayDetails.milestone90dMeds.length > 0 && (
          <div className="mt-2.5 space-y-2" data-testid="calendar-90d-alert-banner">
            {selectedDayDetails.milestone90dMeds.map(({ med, cycleDays, perfilNome }) => (
              <div
                key={`90d-${med.id ?? med.nome}`}
                className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-xs text-amber-950"
              >
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Stethoscope size={15} />
                  <span>
                    [{perfilNome}] Marco de {cycleDays} dias ({Math.round(cycleDays / 30)} meses) —{" "}
                    {med.nome} {med.dosagem}
                  </span>
                </div>
                <p className="mt-1 font-semibold leading-5">{TRIMESTRAL_ALERT_TEXT}</p>
              </div>
            ))}
          </div>
        )}

        {selectedDayDetails.endingMeds.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {selectedDayDetails.endingMeds.map(({ med, perfilNome }) => (
              <div
                key={`end-${med.id ?? med.nome}`}
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900"
              >
                <Flag size={14} className="shrink-0 text-rose-600" />
                <span>
                  <strong>[{perfilNome}]</strong> Último dia do ciclo de{" "}
                  <strong>{med.nome}</strong> ({med.duracaoDias} dias). Se os sintomas persistirem,
                  retorne ao médico!
                </span>
              </div>
            ))}
          </div>
        )}

        {selectedDayDetails.doses.length === 0 ? (
          <p className="mt-2.5 text-xs text-muted">Nenhuma dose programada para esta data.</p>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {selectedDayDetails.doses.map(({ med, horario, perfilNome, acronym, color }, idx) => (
              <li
                key={`${med.id ?? med.nome}-${horario}-${idx}`}
                className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-xs shadow-2xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-md px-2 py-0.5 font-mono text-[11px] font-extrabold text-white shadow-2xs"
                    style={{ backgroundColor: color }}
                  >
                    {acronym}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                    [{perfilNome}]
                  </span>
                  <span className="font-bold text-ink">{med.nome}</span>
                  <span className="text-muted">
                    {med.dosagem} ({formatDoseLabel(med.quantidadePorDose || 1, med.unidade || "comprimido")})
                  </span>
                </div>
                <span className="rounded-md bg-mint px-2 py-0.5 font-mono text-xs font-extrabold text-forest">
                  {horario}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
