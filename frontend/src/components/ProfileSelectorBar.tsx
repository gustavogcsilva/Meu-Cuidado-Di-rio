import { useState } from "react";
import {
  AlertTriangle,
  Baby,
  HeartHandshake,
  Pencil,
  Plus,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import type { KinshipType, PatientProfile } from "../types/medication";

interface ProfileSelectorBarProps {
  profiles: PatientProfile[];
  selectedProfileId: number | "all";
  onSelectProfile: (profileId: number | "all") => void;
  onCreateProfile: (profile: Omit<PatientProfile, "id">) => Promise<void>;
  onUpdateProfile: (profile: PatientProfile) => Promise<void>;
  onDeleteProfile: (profileId: number) => Promise<void>;
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
  onUpdateProfile,
  onDeleteProfile,
}: ProfileSelectorBarProps) {
  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingProfileId, setEditingProfileId] = useState<number | undefined>(undefined);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<PatientProfile | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const [nome, setNome] = useState("");
  const [parentesco, setParentesco] = useState<KinshipType>("idoso");
  const [idade, setIdade] = useState<string>("78");
  const [pesoKg, setPesoKg] = useState<string>("62");
  const [condicaoClinica, setCondicaoClinica] = useState("Alzheimer");
  const [corAvatar, setCorAvatar] = useState("#7c3aed");

  const activeProfile =
    selectedProfileId === "all"
      ? undefined
      : profiles.find((p) => p.id === selectedProfileId);

  function openCreateModal() {
    setEditingProfileId(undefined);
    setNome("");
    setParentesco("idoso");
    setIdade("78");
    setPesoKg("62");
    setCondicaoClinica("Alzheimer");
    setCorAvatar("#7c3aed");
    setModalMode("create");
  }

  function openEditModal(target: PatientProfile) {
    setEditingProfileId(target.id);
    setNome(target.nome);
    setParentesco(target.parentesco);
    setIdade(target.idade !== undefined ? String(target.idade) : "");
    setPesoKg(target.pesoKg !== undefined ? String(target.pesoKg) : "");
    setCondicaoClinica(target.condicaoClinica ?? "");
    setCorAvatar(target.corAvatar || "#246b59");
    setModalMode("edit");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;

    if (modalMode === "edit" && editingProfileId !== undefined) {
      await onUpdateProfile({
        id: editingProfileId,
        nome: nome.trim(),
        parentesco,
        idade: idade ? Number(idade) : undefined,
        pesoKg: pesoKg ? Number(pesoKg) : undefined,
        condicaoClinica: condicaoClinica.trim() || undefined,
        corAvatar,
      });
    } else {
      await onCreateProfile({
        nome: nome.trim(),
        parentesco,
        idade: idade ? Number(idade) : undefined,
        pesoKg: pesoKg ? Number(pesoKg) : undefined,
        condicaoClinica: condicaoClinica.trim() || undefined,
        corAvatar,
      });
    }

    setModalMode("closed");
  }

  async function handleConfirmCascadeDelete() {
    if (!confirmDeleteTarget?.id) return;
    if (profiles.length <= 1) {
      setDeleteError(
        "Não é permitido excluir o último perfil restante. Mantenha pelo menos 1 perfil principal ativo.",
      );
      return;
    }
    try {
      await onDeleteProfile(confirmDeleteTarget.id);
      setConfirmDeleteTarget(null);
      setModalMode("closed");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Não foi possível excluir o perfil.",
      );
    }
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

            {/* Botões de cada Perfil cadastrado com ações rápidas de Editar (✏️) e Excluir (🗑️) */}
            {profiles.map((p) => {
              const isSelected = selectedProfileId === p.id;
              return (
                <div
                  key={p.id}
                  className={`inline-flex items-center rounded-xl transition ${
                    isSelected
                      ? "bg-white text-emerald-950 shadow-sm ring-2 ring-emerald-300"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => p.id && onSelectProfile(p.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                    data-testid={`profile-tab-${p.nome.toLowerCase()}`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: p.corAvatar || "#246b59" }}
                    />
                    <span>{getKinshipEmoji(p.parentesco)}</span>
                    <span>{p.nome}</span>
                    {p.idade !== undefined && (
                      <span
                        className={`rounded px-1 text-[10px] ${
                          isSelected
                            ? "bg-slate-200 text-slate-800"
                            : "bg-white/15 text-emerald-100"
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

                  {/* Botões de Edição (✏️) e Exclusão (🗑️) ao lado do perfil */}
                  <div className="flex items-center border-l border-slate-300/30 pr-1.5 pl-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(p);
                      }}
                      className={`rounded p-1 transition ${
                        isSelected
                          ? "text-slate-600 hover:bg-slate-200 hover:text-emerald-950"
                          : "text-emerald-200 hover:bg-white/15 hover:text-white"
                      }`}
                      title={`Editar perfil ${p.nome}`}
                      data-testid={`edit-profile-btn-${p.nome.toLowerCase()}`}
                    >
                      <Pencil size={12} />
                    </button>

                    <button
                      type="button"
                      disabled={profiles.length <= 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError("");
                        setConfirmDeleteTarget(p);
                      }}
                      className={`rounded p-1 transition disabled:cursor-not-allowed disabled:opacity-35 ${
                        isSelected
                          ? "text-rose-600 hover:bg-rose-100"
                          : "text-rose-300 hover:bg-rose-500/30 hover:text-white"
                      }`}
                      title={
                        profiles.length <= 1
                          ? "Não é possível excluir o último perfil restante"
                          : `Excluir perfil ${p.nome}`
                      }
                      data-testid={`delete-profile-btn-${p.nome.toLowerCase()}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Botão + Novo Perfil */}
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/50 bg-emerald-900/60 px-3 py-1.5 text-xs font-bold text-emerald-200 transition hover:bg-emerald-800"
              data-testid="new-profile-btn"
            >
              <Plus size={14} />
              Novo Perfil
            </button>
          </div>

          {/* Resumo do Perfil Ativo e atalho de edição */}
          <div className="flex items-center gap-2 text-[11px] text-emerald-200">
            {selectedProfileId === "all" ? (
              <span>Visão Consolidada do Cuidador ({profiles.length} perfis ativos)</span>
            ) : activeProfile ? (
              <>
                <span>
                  Ativo: <strong className="text-white">{activeProfile.nome}</strong>
                  {activeProfile.idade !== undefined ? ` • ${activeProfile.idade} anos` : ""}
                  {activeProfile.pesoKg !== undefined ? ` • ${activeProfile.pesoKg} kg` : ""}
                  {activeProfile.condicaoClinica
                    ? ` • Condição: ${activeProfile.condicaoClinica}`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => openEditModal(activeProfile)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/25"
                  data-testid="active-profile-edit-btn"
                >
                  ✏️ Editar
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modal para Criar ou Editar Perfil Familiar / Dependente */}
      {modalMode !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          data-testid="profile-form-modal"
        >
          <div className="w-full max-w-lg rounded-3xl border border-emerald-900/15 bg-white p-6 text-ink shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-forest text-white">
                  <HeartHandshake size={20} />
                </span>
                <div>
                  <h2 className="text-lg font-bold">
                    {modalMode === "edit"
                      ? `✏️ Editar Perfil: ${nome}`
                      : "Novo Perfil (Conta Família / Dependente)"}
                  </h2>
                  <p className="text-xs text-muted">
                    Configure nome, parentesco, idade, peso (kg), condição clínica e cor do avatar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalMode("closed")}
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
                  <label className="block text-xs font-bold text-slate-700">
                    Parentesco / Vínculo
                  </label>
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
                <label className="block text-xs font-bold text-slate-700">
                  Cor do Avatar
                </label>
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

              {modalMode === "create" && (
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
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                {modalMode === "edit" && editingProfileId !== undefined ? (
                  <button
                    type="button"
                    disabled={profiles.length <= 1}
                    onClick={() => {
                      const target = profiles.find((p) => p.id === editingProfileId);
                      if (target) {
                        setDeleteError("");
                        setConfirmDeleteTarget(target);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                    data-testid="modal-delete-profile-btn"
                  >
                    <Trash2 size={14} />
                    🗑️ Excluir Perfil
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalMode("closed")}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-forest px-5 py-2 text-xs font-bold text-white hover:bg-emerald-900"
                    data-testid="save-profile-btn"
                  >
                    {modalMode === "edit" ? "Salvar Alterações" : "Salvar Perfil Familiar"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação Explícita de Exclusão em Cascata de Perfil */}
      {confirmDeleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          data-testid="confirm-delete-profile-modal"
        >
          <div className="w-full max-w-md rounded-3xl border-2 border-rose-300 bg-white p-6 text-ink shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-700">
                <AlertTriangle size={24} />
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-ink">
                  Excluir Perfil [{confirmDeleteTarget.nome}]?
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-700">
                  Tem certeza que deseja excluir o perfil{" "}
                  <strong>{confirmDeleteTarget.nome}</strong> e todas as medicações, registros de
                  doses e históricos de chat vinculados a ele?
                </p>
                <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                  ⚠️ Esta operação remove em cascata todos os dados deste perfil no IndexedDB.
                </p>
              </div>
            </div>

            {deleteError && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={profiles.length <= 1}
                onClick={() => void handleConfirmCascadeDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-40"
                data-testid="confirm-cascade-delete-btn"
              >
                <Trash2 size={14} />
                Sim, Excluir Perfil e Vínculos
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
