import {
  AlertTriangle,
  Brain,
  CalendarClock,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserCheck,
  X,
} from "lucide-react";
import { formatDoseLabel } from "../services/api";
import type { MedicationMiniReport } from "../types/medication";

interface MiniReportModalProps {
  report: MedicationMiniReport | null;
  onClose: () => void;
}

export function MiniReportModal({ report, onClose }: MiniReportModalProps) {
  if (!report) return null;

  const { resumoBula } = report;
  const doseFormatted = formatDoseLabel(report.quantidadePorDose || 1, report.unidade || "comprimido");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mini-report-title"
      data-testid="mini-report-modal"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-emerald-900/15 bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-forest text-white shadow-sm">
              <Sparkles size={22} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-forest">
                  Mini-Relatório Inteligente IA
                </span>
                <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-bold text-white">
                  Perfil: [{report.perfilNome || "Eu"}]
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    report.origemPrescricao === "emergencia"
                      ? "bg-rose-100 text-rose-900"
                      : "bg-indigo-100 text-indigo-900"
                  }`}
                >
                  {report.origemPrescricao === "emergencia"
                    ? "🚑 Emergência / Pronto-Socorro"
                    : "🩺 Tratamento Especializado"}
                </span>
                {report.condicaoTratamento && (
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-900">
                    🎯 {report.condicaoTratamento}
                  </span>
                )}
              </div>
              <h2 id="mini-report-title" className="mt-1.5 text-2xl font-bold text-ink">
                {report.nome} <span className="text-forest">{report.dosagem}</span>{" "}
                <span className="text-base font-semibold text-muted">({doseFormatted}/dose)</span>
              </h2>
              <p className="text-xs font-medium text-muted">{resumoBula.tarja}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Fechar mini-relatório"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Contexto Clínico do Perfil (Pediátrico / Geriátrico / Condição Clínica como Alzheimer) */}
          {resumoBula.contextoPerfilClinico && (
            <section
              className="rounded-2xl border-2 border-indigo-300 bg-indigo-50/85 p-4 text-indigo-950"
              data-testid="report-profile-clinical-context"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
                <UserCheck size={18} />
                <h3>Análise Personalizada para o Perfil [{report.perfilNome}]</h3>
              </div>
              <p className="mt-1.5 text-sm leading-6">{resumoBula.contextoPerfilClinico}</p>
            </section>
          )}

          {/* Contexto da Condição / Tratamento Indicado */}
          {resumoBula.contextoCondicaoTratamento && (
            <section
              className="rounded-2xl border border-violet-300 bg-violet-50/75 p-4 text-violet-950"
              data-testid="report-condition-context"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-violet-900">
                <Brain size={17} />
                <h3>Papel no Tratamento Indicado</h3>
              </div>
              <p className="mt-1 text-sm leading-6">{resumoBula.contextoCondicaoTratamento}</p>
            </section>
          )}

          {/* Para que serve */}
          <section className="rounded-2xl border border-emerald-900/10 bg-mint/45 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-forest">
              <FileText size={17} />
              <h3>Para que serve (Resumo Direto)</h3>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-ink">{resumoBula.paraQueServe}</p>
            {resumoBula.avisoOrigemPrescricao && (
              <p className="mt-2 rounded-xl bg-white/85 px-3 py-2 text-xs font-semibold text-slate-800">
                {resumoBula.avisoOrigemPrescricao}
              </p>
            )}
          </section>

          {/* Destaque de Uso Contínuo / Tratamento Especializado e Lembrete de 3 Meses (90 dias) */}
          {(report.tipo === "continuo" || report.origemPrescricao === "especializado") && (
            <section
              className="rounded-2xl border-2 border-amber-400/80 bg-amber-50/90 p-4 text-amber-950"
              data-testid="continuous-use-highlight"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <ShieldAlert size={19} className="shrink-0 text-amber-700" />
                <h3>Atenção Especial: Tratamento Especializado / Uso Contínuo</h3>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-6">
                {resumoBula.usoContinuoAviso ||
                  "Não interrompa o uso abruptamente sem orientação médica, sob risco de efeito rebote ou sintomas de abstinência."}
              </p>

              {report.alertaReavaliacaoTrimestral && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-white/90 p-3 text-xs leading-5 text-amber-950">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Stethoscope size={15} />
                    <span>
                      Regra Automática de Reavaliação Trimestral (90 Dias
                      {report.marcoReavaliacao90Dias
                        ? ` — Marco em ${new Date(
                            `${report.marcoReavaliacao90Dias}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}`
                        : ""}
                      ):
                    </span>
                  </div>
                  <p className="mt-1 font-semibold">{report.alertaReavaliacaoTrimestral}</p>
                </div>
              )}
            </section>
          )}

          {/* Cruzamento de Interações com o Banco Local */}
          <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-violet-950">
              <AlertTriangle size={17} className="text-violet-700" />
              <h3>Interações Medicamentosas (Cruzamento com o Perfil [{report.perfilNome}])</h3>
            </div>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-violet-950">
              {resumoBula.interacoes.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Principais Alertas */}
            <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-rose-950">
                <ShieldAlert size={17} className="text-rose-700" />
                <h3>Principais Alertas</h3>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-rose-950 sm:text-sm">
                {resumoBula.alertasPrincipais.map((alerta, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600" />
                    <span>{alerta}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Efeitos Colaterais Comuns */}
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <CalendarClock size={17} className="text-slate-700" />
                <h3>Efeitos Colaterais Comuns</h3>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-700 sm:text-sm">
                {resumoBula.efeitosColaterais.map((efeito, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                    <span>{efeito}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-muted">
            Este mini-relatório é informativo e não substitui a orientação médica ou farmacêutica.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900"
            data-testid="close-mini-report-btn"
          >
            <CheckCircle2 size={17} />
            Entendi, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
