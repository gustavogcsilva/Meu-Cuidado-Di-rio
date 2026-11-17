import { useMemo } from "react";
import { Hourglass, PackageCheck, Pill } from "lucide-react";
import type { Medication, MedicationUnit } from "../types/medication";

interface HighReadabilityKpiBarProps {
  medications: Medication[];
  referenceDate: string;
}

export function formatBoxEquivalence(
  estoqueAtual: number,
  estoqueTotal: number,
  unidade: MedicationUnit = "comprimido",
): string {
  const unitShort =
    unidade === "comprimido"
      ? "comp."
      : unidade === "capsula"
        ? "cáps."
        : unidade === "gotas"
          ? "gotas"
          : "ml";

  const containerSingular = unidade === "gotas" || unidade === "ml" ? "frasco" : "caixa";
  const containerPlural = unidade === "gotas" || unidade === "ml" ? "frascos" : "caixas";

  const baseBoxSize =
    estoqueTotal > 0
      ? estoqueTotal
      : unidade === "gotas"
        ? 200
        : unidade === "ml"
          ? 100
          : 20;

  const boxesCount =
    estoqueAtual <= 0 ? 0 : Math.max(1, Math.ceil(estoqueAtual / Math.max(1, baseBoxSize)));

  return `${estoqueAtual} ${unitShort} (${boxesCount} ${
    boxesCount === 1 ? containerSingular : containerPlural
  })`;
}

function diffDaysBetween(startIso: string, targetIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${targetIso}T12:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function HighReadabilityKpiBar({
  medications,
  referenceDate,
}: HighReadabilityKpiBarProps) {
  const stats = useMemo(() => {
    const active = medications.filter((m) => m.ativo);
    const continuous = active.filter(
      (m) => m.tipo === "continuo" || m.origemPrescricao === "especializado",
    );
    const temporary = active.filter(
      (m) => m.tipo === "temporario" && m.origemPrescricao !== "especializado",
    );

    // Cálculo de Caixas / Frascos e Unidades em Estoque
    let totalSolidUnits = 0;
    let totalSolidBoxes = 0;
    let totalLiquidUnits = 0;
    let totalLiquidBottles = 0;

    active.forEach((m) => {
      const boxBase =
        m.estoqueTotal > 0
          ? m.estoqueTotal
          : m.unidade === "gotas"
            ? 200
            : m.unidade === "ml"
              ? 100
              : 20;
      const count =
        m.estoqueAtual <= 0 ? 0 : Math.max(1, Math.ceil(m.estoqueAtual / Math.max(1, boxBase)));

      if (m.unidade === "gotas" || m.unidade === "ml") {
        totalLiquidUnits += m.estoqueAtual;
        totalLiquidBottles += count;
      } else {
        totalSolidUnits += m.estoqueAtual;
        totalSolidBoxes += count;
      }
    });

    let stockHeadline = "0 comp. (0 caixas)";
    let stockSubline = "Adicione medicamentos para calcular caixas e frascos";

    if (totalSolidUnits > 0 && totalLiquidUnits > 0) {
      stockHeadline = `${totalSolidUnits} comp. (${totalSolidBoxes} ${
        totalSolidBoxes === 1 ? "caixa" : "caixas"
      })`;
      stockSubline = `+ ${totalLiquidUnits} gotas/ml (${totalLiquidBottles} ${
        totalLiquidBottles === 1 ? "frasco" : "frascos"
      })`;
    } else if (totalSolidUnits > 0) {
      stockHeadline = `${totalSolidUnits} comp. (${totalSolidBoxes} ${
        totalSolidBoxes === 1 ? "caixa" : "caixas"
      })`;
      stockSubline = `${totalSolidBoxes} ${
        totalSolidBoxes === 1 ? "caixa ativa" : "caixas ativas"
      } em uso no estoque`;
    } else if (totalLiquidUnits > 0) {
      stockHeadline = `${totalLiquidUnits} gotas/ml (${totalLiquidBottles} ${
        totalLiquidBottles === 1 ? "frasco" : "frascos"
      })`;
      stockSubline = `${totalLiquidBottles} ${
        totalLiquidBottles === 1 ? "frasco ativo" : "frascos ativos"
      } em uso`;
    }

    // Cálculo de Tempo Restante (Temporário) e Autonomia de Estoque (Contínuo)
    let minContinuousDays: number | null = null;
    continuous.forEach((m) => {
      const dosesDay = Math.max(1, m.horarios.length) * Math.max(0.1, m.quantidadePorDose || 1);
      const autonomy = Math.floor(m.estoqueAtual / dosesDay);
      if (minContinuousDays === null || autonomy < minContinuousDays) {
        minContinuousDays = autonomy;
      }
    });

    let maxTemporaryRemaining: number | null = null;
    temporary.forEach((m) => {
      const elapsed = diffDaysBetween(m.dataInicio, referenceDate);
      const totalD = m.duracaoDias ?? 3;
      const rem = Math.max(0, totalD - elapsed);
      if (maxTemporaryRemaining === null || rem > maxTemporaryRemaining) {
        maxTemporaryRemaining = rem;
      }
    });

    let timeHeadline = "Sem ciclos ativos";
    let timeSubline = "Cadastre uma medicação para ver a autonomia";

    if (minContinuousDays !== null && maxTemporaryRemaining !== null) {
      timeHeadline = `Dura mais ${minContinuousDays} dias`;
      timeSubline = `Temporário: Faltam ${maxTemporaryRemaining} ${
        maxTemporaryRemaining === 1 ? "dia" : "dias"
      } para terminar`;
    } else if (minContinuousDays !== null) {
      timeHeadline = `Dura mais ${minContinuousDays} ${
        minContinuousDays === 1 ? "dia" : "dias"
      }`;
      timeSubline = "Autonomia do estoque de uso contínuo";
    } else if (maxTemporaryRemaining !== null) {
      timeHeadline = `Faltam ${maxTemporaryRemaining} ${
        maxTemporaryRemaining === 1 ? "dia" : "dias"
      } para terminar`;
      timeSubline = "Tempo restante do tratamento temporário";
    }

    return {
      totalActive: active.length,
      continuousCount: continuous.length,
      temporaryCount: temporary.length,
      stockHeadline,
      stockSubline,
      timeHeadline,
      timeSubline,
    };
  }, [medications, referenceDate]);

  return (
    <section
      className="mb-6 grid gap-4 md:grid-cols-3"
      aria-label="Resumo Rápido de Alta Legibilidade"
      data-testid="high-readability-kpi-bar"
    >
      {/* KPI 1: Total de Remédios Ativos */}
      <div
        className="flex items-start gap-4 rounded-3xl border-2 border-emerald-900/15 bg-white p-5 shadow-card"
        data-testid="kpi-total-active"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-forest text-white shadow-sm">
          <Pill size={28} />
        </span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-forest">
            💊 Total de Remédios Ativos
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {stats.totalActive} {stats.totalActive === 1 ? "remédio" : "remédios"}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            <strong className="text-indigo-800">{stats.continuousCount} contínuo(s)</strong> •{" "}
            <strong className="text-rose-800">{stats.temporaryCount} temporário(s)</strong>
          </p>
        </div>
      </div>

      {/* KPI 2: Caixas / Frascos em Estoque */}
      <div
        className="flex items-start gap-4 rounded-3xl border-2 border-emerald-900/15 bg-white p-5 shadow-card"
        data-testid="kpi-stock-boxes"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white shadow-sm">
          <PackageCheck size={28} />
        </span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
            📦 Caixas / Frascos em Estoque
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {stats.stockHeadline}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">{stats.stockSubline}</p>
        </div>
      </div>

      {/* KPI 3: Tempo Restante de Tratamento / Autonomia */}
      <div
        className="flex items-start gap-4 rounded-3xl border-2 border-emerald-900/15 bg-white p-5 shadow-card"
        data-testid="kpi-remaining-time"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-600 text-white shadow-sm">
          <Hourglass size={28} />
        </span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
            ⏳ Tempo Restante / Autonomia
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {stats.timeHeadline}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">{stats.timeSubline}</p>
        </div>
      </div>
    </section>
  );
}
