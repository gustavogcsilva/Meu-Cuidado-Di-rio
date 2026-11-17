import Dexie, { type Table } from "dexie";
import type {
  ChatHistoryEntry,
  DoseLog,
  Medication,
  PatientProfile,
} from "../types/medication";

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

        await tx
          .table("medications")
          .toCollection()
          .modify((med: Partial<Medication>) => {
            if (!med.profileId) med.profileId = defaultProfileId;
            if (!med.unidade) med.unidade = "comprimido";
            if (!med.quantidadePorDose) med.quantidadePorDose = 1;
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
