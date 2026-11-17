import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Clock, Volume2 } from "lucide-react";
import type { DoseLog, Medication } from "../types/medication";

interface OverdueDoseItem {
  key: string;
  med: Medication;
  horario: string;
  minutosAtraso: number;
}

interface DoseVerificationBannerProps {
  medications: Medication[];
  doseLogs: DoseLog[];
  onConfirmDose: (med: Medication, scheduledTime: string) => Promise<void>;
}

export function playVerificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.12, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch {
    // Silencioso se navegador bloquear autoplay de áudio
  }

  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([150, 100, 150]);
    }
  } catch {
    // Silencioso
  }
}

export function DoseVerificationBanner({
  medications,
  doseLogs,
  onConfirmDose,
}: DoseVerificationBannerProps) {
  const [snoozedUntilMap, setSnoozedUntilMap] = useState<Record<string, number>>({});
  const [nowMinute, setNowMinute] = useState(() => Date.now());

  // Atualiza a cada 30 segundos para recalcular doses que passaram de 15 minutos
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMinute(Date.now());
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const overdueDoses = useMemo<OverdueDoseItem[]>(() => {
    const nowDate = new Date(nowMinute);
    const currentMinutesFromMidnight = nowDate.getHours() * 60 + nowDate.getMinutes();
    const list: OverdueDoseItem[] = [];

    medications
      .filter((m) => m.ativo && m.estoqueAtual > 0)
      .forEach((med) => {
        med.horarios.forEach((horario) => {
          const [hStr, mStr] = horario.split(":");
          const slotMinutes = Number(hStr) * 60 + Number(mStr);
          const diffMinutes = currentMinutesFromMidnight - slotMinutes;

          // Se passou mais de 15 minutos do horário agendado (e no mesmo dia, dentro de 12 horas)
          if (diffMinutes >= 15 && diffMinutes <= 720) {
            const key = `dose-${med.id}-${todayStr}-${horario}`;

            // Checa se já está em snooze (adiado em 10 minutos)
            const snoozedUntil = snoozedUntilMap[key];
            if (snoozedUntil && nowMinute < snoozedUntil) {
              return;
            }

            // Checa se já houve registro de dose tomada para este medicamento hoje próximo deste horário
            const alreadyTakenToday = doseLogs.some((log) => {
              if (log.medicationId !== med.id || log.status !== "tomado") return false;
              if (!log.dataHoraTomada) return false;
              return log.dataHoraTomada.startsWith(todayStr);
            });

            if (!alreadyTakenToday) {
              list.push({
                key,
                med,
                horario,
                minutosAtraso: diffMinutes,
              });
            }
          }
        });
      });

    return list;
  }, [medications, doseLogs, nowMinute, todayStr, snoozedUntilMap]);

  // Se houver doses atrasadas recém-detectadas, emite o chime sonoro e vibração
  useEffect(() => {
    if (overdueDoses.length > 0) {
      playVerificationChime();
    }
  }, [overdueDoses.length]);

  if (overdueDoses.length === 0) return null;

  function handleSnooze(key: string) {
    setSnoozedUntilMap((prev) => ({
      ...prev,
      [key]: Date.now() + 10 * 60 * 1000, // 10 minutos
    }));
  }

  return (
    <section
      className="mb-6 space-y-3"
      aria-label="Alerta de Verificação de Doses Atrasadas"
      data-testid="dose-verification-banner-section"
    >
      {overdueDoses.map(({ key, med, horario, minutosAtraso }) => (
        <div
          key={key}
          className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-md sm:p-5"
          data-testid={`dose-verification-card-${med.nome.toLowerCase()}`}
        >
          <div className="flex items-start gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-sm">
              <BellRing size={24} className="animate-pulse" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                  Verificação de Horário (+{minutosAtraso} min)
                </span>
                <span className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-slate-800">
                  Previsto: {horario}
                </span>
              </div>
              <p className="mt-1 text-base font-extrabold tracking-tight sm:text-lg">
                ⏰ Hora de verificar: Você já tomou{" "}
                <span className="text-forest underline">{med.nome} {med.dosagem}</span> das{" "}
                <span className="font-mono">{horario}</span>?
              </p>
              <p className="text-xs text-amber-900/80">
                Evite esquecimentos na sua rotina. Confirme a tomada para atualizar o estoque ou adie por 10 minutos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onConfirmDose(med, horario)}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-forest px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-900 sm:text-sm"
              data-testid={`confirm-taken-btn-${med.nome.toLowerCase()}`}
            >
              <Check size={18} />
              ✅ Sim, já tomei
            </button>

            <button
              type="button"
              onClick={() => handleSnooze(key)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border-2 border-amber-300 bg-white px-3.5 py-2.5 text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-100/70 sm:text-sm"
              data-testid={`snooze-dose-btn-${med.nome.toLowerCase()}`}
            >
              <Clock size={16} />
              ⏰ Lembrar em 10 min
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
