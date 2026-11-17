import Dexie, { type Table } from "dexie";
import type {
  ChatHistoryEntry,
  DoseLog,
  Medication,
  PatientProfile,
} from "../types/medication";

export const MEDICATION_COLOR_PALETTE: { label: string; hex: string }[] = [
  { label: "Azul Real", hex: "#2563eb" },
  { label: "Esmeralda", hex: "#059669" },
  { label: "Roxo", hex: "#7c3aed" },
  { label: "Laranja", hex: "#d97706" },
  { label: "Rosa Forte", hex: "#e11d48" },
  { label: "Ciano", hex: "#0891b2" },
  { label: "Índigo", hex: "#4f46e5" },
  { label: "Verde Floresta", hex: "#246b59" },
];

export function getMedicationAcronym(nome: string): string {
  const cleaned = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return (cleaned.slice(0, 3) || "MED").padEnd(3, "X");
}

export function getDefaultMedicationColor(nome: string, index = 0): string {
  const norm = nome.toLowerCase();
  if (norm.includes("gardenal") || norm.includes("fenobarbital")) return "#7c3aed"; // Roxo
  if (norm.includes("escitalopram") || norm.includes("sertralina")) return "#2563eb"; // Azul
  if (norm.includes("dipirona")) return "#059669"; // Esmeralda
  if (norm.includes("clonazepam") || norm.includes("rivotril")) return "#e11d48"; // Rosa Forte
  if (norm.includes("buscopan")) return "#d97706"; // Laranja
  if (norm.includes("donepezila")) return "#0891b2"; // Ciano
  return MEDICATION_COLOR_PALETTE[index % MEDICATION_COLOR_PALETTE.length].hex;
}

export class MedicationDatabase extends Dexie {
  profiles!: Table<PatientProfile, number>;
  medications!: Table<Medication, number>;
  dose_logs!: Table<DoseLog, number>;
  chat_history!: Table<ChatHistoryEntry, number>;

  constructor() {
    super("meu-cuidado");

    this.version(1).stores({
      medications: "++id, nome, tipo, controlado, ativo, dataInicio",
      dose_logs: "++id, medicationId, dataHoraPrevista, status",
      chat_history: "++id, role, timestamp",
    });

    this.version(2)
      .stores({
        profiles: "++id, nome, parentesco, condicaoClinica",
        medications: "++id, profileId, nome, tipo, controlado, ativo, dataInicio, origemPrescricao",
        dose_logs: "++id, profileId, medicationId, dataHoraPrevista, status",
        chat_history: "++id, profileId, role, timestamp",
      })
      .upgrade(async (tx) => {
        const profilesTable = tx.table<PatientProfile, number>("profiles");
        const count = await profilesTable.count();
        let defaultProfileId = 1;
        if (count === 0) {
          defaultProfileId = await profilesTable.add({
            nome: "Eu",
            parentesco: "proprio",
            idade: 35,
            pesoKg: 72,
            condicaoClinica: "",
            corAvatar: "#246b59",
          });
        }

        let idx = 0;
        await tx
          .table("medications")
          .toCollection()
          .modify((med: Partial<Medication>) => {
            if (!med.profileId) med.profileId = defaultProfileId;
            if (!med.unidade) med.unidade = "comprimido";
            if (!med.quantidadePorDose) med.quantidadePorDose = 1;
            if (!med.corIdentificacao) {
              med.corIdentificacao = getDefaultMedicationColor(med.nome ?? "", idx++);
            }
            if (!med.origemPrescricao) {
              med.origemPrescricao = med.tipo === "continuo" ? "especializado" : "emergencia";
            }
          });

        await tx
          .table("dose_logs")
          .toCollection()
          .modify((log: Partial<DoseLog>) => {
            if (!log.profileId) log.profileId = defaultProfileId;
          });

        await tx
          .table("chat_history")
          .toCollection()
          .modify((entry: Partial<ChatHistoryEntry>) => {
            if (!entry.profileId) entry.profileId = defaultProfileId;
          });
      });
  }
}

export const database = new MedicationDatabase();

export async function ensureDefaultProfiles(): Promise<PatientProfile[]> {
  const existing = await database.profiles.toArray();
  if (existing.length > 0) {
    return existing;
  }

  const initialProfiles: PatientProfile[] = [
    {
      nome: "Eu",
      parentesco: "proprio",
      idade: 35,
      pesoKg: 72,
      condicaoClinica: "",
      corAvatar: "#246b59",
    },
    {
      nome: "Mãe",
      parentesco: "idoso",
      idade: 78,
      pesoKg: 62,
      condicaoClinica: "Alzheimer",
      corAvatar: "#7c3aed",
    },
    {
      nome: "Filho",
      parentesco: "filho",
      idade: 7,
      pesoKg: 24,
      condicaoClinica: "",
      corAvatar: "#0284c7",
    },
  ];

  await database.profiles.bulkAdd(initialProfiles);
  return database.profiles.toArray();
}

export async function deleteProfileCascade(profileId: number): Promise<{
  deletedMeds: number;
  remainingProfiles: PatientProfile[];
}> {
  return database.transaction(
    "rw",
    [database.profiles, database.medications, database.dose_logs, database.chat_history],
    async () => {
      const totalProfiles = await database.profiles.count();
      if (totalProfiles <= 1) {
        throw new Error(
          "Não é permitido excluir o último perfil restante. O sistema deve manter pelo menos 1 perfil principal ativo.",
        );
      }

      const deletedMeds = await database.medications.where("profileId").equals(profileId).delete();
      await database.dose_logs.where("profileId").equals(profileId).delete();
      await database.chat_history.where("profileId").equals(profileId).delete();
      await database.profiles.delete(profileId);

      const remainingProfiles = await database.profiles.toArray();
      return { deletedMeds, remainingProfiles };
    },
  );
}
