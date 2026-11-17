import { useState } from "react";
import { Baby, HeartHandshake, Plus, User, Users, X } from "lucide-react";
import type { KinshipType, PatientProfile } from "../types/medication";

interface ProfileSelectorBarProps {
  profiles: PatientProfile[];
  selectedProfileId: number | "all";
  onSelectProfile: (profileId: number | "all") => void;
  onCreateProfile: (profile: Omit<PatientProfile, "id">) => Promise<void>;
}

const CONDITION_SUGGESTIONS = [
  "Alzheimer",
  "Epilepsia",
  "Ansiedade",
  "Hipertensão",
  "Pós-operatório",
  "Diabetes",
];

const AVATAR_COLORS = [
  "#246b59",
  "#7c3aed",
  "#0284c7",
  "#d97706",
  "#e11d48",
  "#0f766e",
];

export function getKinshipEmoji(parentesco: KinshipType): string {
  switch (parentesco) {
    case "proprio":
      return "👤";
    case "filho":
      return "👶";
    case "idoso":
      return "👵";
    case "dependente":
      return "🧑‍🦽";
  }
}

export function ProfileSelectorBar({
  profiles,
  selectedProfileId,
  onSelectProfile,
  onCreateProfile,
}: ProfileSelectorBarProps) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [nome, setNome] = useState("");
  const [parentesco, setParentesco] = useState<KinshipType>("idoso");
  const [idade, setIdade] = useState<string>("78");
  const [pesoKg, setPesoKg] = useState<string>("62");
  const [condicaoClinica, setCondicaoClinica] = useState("Alzheimer");
  const [corAvatar, setCorAvatar] = useState("#7c3aed");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    await onCreateProfile({
      nome: nome.trim(),
      parentesco,
      idade: idade ? Number(idade) : undefined,
      pesoKg: pesoKg ? Number(pesoKg) : undefined,
      condicaoClinica: condicaoClinica.trim() || undefined,
      corAvatar,
    });
    setNome("");
    setShowNewModal(false);
  }

  return (
    <>
      <div
        className="border-t border-emerald-950/10 bg-emerald-950/95 text-white"
        data-testid="profile-selector-bar"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-8">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="mr-1 hidden items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-300 sm:inline-flex">
              <Users size={14} />
              Conta Família:
            </span>

            {/* Visão Consolidada "Todos" */}
            <button
              type="button"
              onClick={() => onSelectProfile("all")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                selectedProfileId === "all"
                  ? "bg-emerald-400 text-emerald-950 shadow-sm"
                  : "bg-white/10 text-emerald-100 hover:bg-white/20"
              }`}
              data-testid="profile-tab-all"
            >
              <span>👨‍👩‍👧</span>
              <span>Todos ({profiles.length})</span>
            </button>

            {/* Botões de cada Perfil cadastrado */}
            {profiles.map((p) => {
              const isSelected = selectedProfileId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => p.id && onSelectProfile(p.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    isSelected
                      ? "bg-white text-emerald-950 shadow-sm ring-2 ring-emerald-300"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                  data-testid={`profile-tab-${p.nome.toLowerCase()}`}
                >
                  <span>{getKinshipEmoji(p.parentesco)}</span>
                  <span>{p.nome}</span>
                  {p.idade && (
                    <span
                      className={`rounded px-1 text-[10px] ${
                        isSelected ? "bg-slate-200 text-slate-800" : "bg-white/15 text-emerald-100"
                      }`}
                    >
                      {p.idade}a
                    </span>
                  )}
                  {p.condicaoClinica && (
                    <span
                      className={`hidden rounded-full px-1.5 py-0.2 text-[10px] font-semibold sm:inline-block ${
                        isSelected
                          ? "bg-violet-100 text-violet-900"
                          : "bg-violet-500/30 text-violet-100"
                      }`}
                    >
                      {p.condicaoClinica}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Botão + Novo Perfil */}
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/50 bg-emerald-900/60 px-3 py-1.5 text-xs font-bold text-emerald-200 transition hover:bg-emerald-800"
              data-testid="new-profile-btn"
            >
              <Plus size={14} />
              Novo Perfil
            </button>
          </div>

          {/* Resumo do Perfil Ativo */}
          <div className="text-[11px] text-emerald-200">
            {selectedProfileId === "all" ? (
              <span>Visão Consolidada do Cuidador (Ordem Cronológica da Família)</span>
            ) : (
              (() => {
                const active = profiles.find((p) => p.id === selectedProfileId);
                if (!active) return null;
                return (
                  <span>
                    Ativo: <strong className="text-white">{active.nome}</strong>
                    {active.idade ? ` • ${active.idade} anos` : ""}
                    {active.pesoKg ? ` • ${active.pesoKg} kg` : ""}
                    {active.condicaoClinica ? ` • Condição: ${active.condicaoClinica}` : ""}
                  </span>
                );
              })()
            )}
          </div>
        </div>
      </div>

      {/* Modal para criar Novo Perfil Familiar / Dependente */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          data-testid="new-profile-modal"
        >
          <div className="w-full max-w-lg rounded-3xl border border-emerald-900/15 bg-white p-6 text-ink shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-forest text-white">
                  <HeartHandshake size={20} />
                </span>
                <div>
                  <h2 className="text-lg font-bold">Novo Perfil (Conta Família / Dependente)</h2>
                  <p className="text-xs text-muted">
                    Isole o estoque, calendário e contexto clínico da IA para cada familiar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    Nome do Familiar / Paciente *
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Mãe, Filho, Avô, Maria..."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="profile-input-nome"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">Parentesco / Vínculo</label>
                  <select
                    value={parentesco}
                    onChange={(e) => setParentesco(e.target.value as KinshipType)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="profile-select-parentesco"
                  >
                    <option value="idoso">👵 Idoso / Pai / Mãe</option>
                    <option value="filho">👶 Filho(a) / Criança</option>
                    <option value="dependente">🧑‍🦽 Dependente Impossibilitado</option>
                    <option value="proprio">👤 Próprio (Eu)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    Idade (anos — opcional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={idade}
                    onChange={(e) => setIdade(e.target.value)}
                    placeholder="Ex: 78"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="profile-input-idade"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    Peso em kg (opcional — cálculo de gotas)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={250}
                    step="0.5"
                    value={pesoKg}
                    onChange={(e) => setPesoKg(e.target.value)}
                    placeholder="Ex: 62"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="profile-input-peso"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Condição Clínica Principal (Opcional — enviada ao Assistente de IA)
                </label>
                <input
                  type="text"
                  value={condicaoClinica}
                  onChange={(e) => setCondicaoClinica(e.target.value)}
                  placeholder="Ex: Alzheimer, Epilepsia, Ansiedade, Hipertensão..."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  data-testid="profile-input-condicao"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CONDITION_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setCondicaoClinica(sug)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        condicaoClinica === sug
                          ? "bg-forest text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-mint"
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Cor de Identificação</label>
                <div className="mt-1.5 flex items-center gap-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCorAvatar(color)}
                      className={`h-7 w-7 rounded-full border-2 transition ${
                        corAvatar === color ? "scale-110 border-slate-900" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Cor ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* Atalhos rápidos de preenchimento de perfil para validação */}
              <div className="rounded-2xl bg-slate-50 p-3 text-xs">
                <p className="font-bold text-slate-700">Atalhos Rápidos de Perfil:</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNome("Mãe");
                      setParentesco("idoso");
                      setIdade("78");
                      setPesoKg("62");
                      setCondicaoClinica("Alzheimer");
                      setCorAvatar("#7c3aed");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 font-semibold text-violet-900"
                  >
                    <User size={12} /> Preencher: Mãe (78a • Alzheimer)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNome("Filho");
                      setParentesco("filho");
                      setIdade("7");
                      setPesoKg("24");
                      setCondicaoClinica("Febre / Pediatria");
                      setCorAvatar("#0284c7");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 font-semibold text-sky-900"
                  >
                    <Baby size={12} /> Preencher: Filho (7a • 24kg)
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-forest px-5 py-2 text-xs font-bold text-white hover:bg-emerald-900"
                  data-testid="save-profile-btn"
                >
                  Salvar Perfil Familiar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
