import {
  database,
  deleteProfileCascade,
  ensureDefaultProfiles,
} from "../db/database";
import type {
  ChatHistoryEntry,
  DoseLog,
  Medication,
  PatientProfile,
} from "../types/medication";

/**
 * Interface limpa do padrão Repository para desacoplar a camada de UI
 * do mecanismo de persistência. Permite plugar facilmente um backend remoto
 * (PostgreSQL / Supabase / Firebase / REST API) sem alterar os componentes.
 */
export interface IStorageRepository {
  // --- Perfis ---
  getProfiles(): Promise<PatientProfile[]>;
  getProfileById(id: number): Promise<PatientProfile | undefined>;
  createProfile(profile: Omit<PatientProfile, "id">): Promise<number>;
  updateProfile(profile: PatientProfile): Promise<void>;
  deleteProfileCascade(profileId: number): Promise<{
    deletedMeds: number;
    remainingProfiles: PatientProfile[];
  }>;

  // --- Medicamentos ---
  getMedications(): Promise<Medication[]>;
  getMedicationsByProfile(profileId: number): Promise<Medication[]>;
  createMedication(med: Omit<Medication, "id">): Promise<number>;
  updateMedication(id: number, changes: Partial<Medication>): Promise<void>;
  deleteMedication(id: number): Promise<void>;

  // --- Registro de Doses ---
  getDoseLogs(profileId?: number): Promise<DoseLog[]>;
  recordDoseTaken(profileId: number, medicationId: number, dateHoraIso?: string): Promise<number>;

  // --- Histórico de Chat / Consultas ---
  getChatHistory(profileId?: number, limit?: number): Promise<ChatHistoryEntry[]>;
  addChatEntry(entry: Omit<ChatHistoryEntry, "id">): Promise<number>;
  clearChatHistory(profileId?: number): Promise<void>;
}

export class DexieStorageRepository implements IStorageRepository {
  async getProfiles(): Promise<PatientProfile[]> {
    return ensureDefaultProfiles();
  }

  async getProfileById(id: number): Promise<PatientProfile | undefined> {
    return database.profiles.get(id);
  }

  async createProfile(profile: Omit<PatientProfile, "id">): Promise<number> {
    return database.profiles.add(profile);
  }

  async updateProfile(profile: PatientProfile): Promise<void> {
    if (!profile.id) return;
    await database.profiles.update(profile.id, {
      nome: profile.nome,
      parentesco: profile.parentesco,
      idade: profile.idade,
      pesoKg: profile.pesoKg,
      condicaoClinica: profile.condicaoClinica,
      corAvatar: profile.corAvatar,
    });
  }

  async deleteProfileCascade(profileId: number): Promise<{
    deletedMeds: number;
    remainingProfiles: PatientProfile[];
  }> {
    return deleteProfileCascade(profileId);
  }

  async getMedications(): Promise<Medication[]> {
    return database.medications.orderBy("nome").toArray();
  }

  async getMedicationsByProfile(profileId: number): Promise<Medication[]> {
    return database.medications.where("profileId").equals(profileId).sortBy("nome");
  }

  async createMedication(med: Omit<Medication, "id">): Promise<number> {
    return database.medications.add(med as Medication);
  }

  async updateMedication(id: number, changes: Partial<Medication>): Promise<void> {
    await database.medications.update(id, changes);
  }

  async deleteMedication(id: number): Promise<void> {
    await database.medications.delete(id);
  }

  async getDoseLogs(profileId?: number): Promise<DoseLog[]> {
    if (profileId !== undefined) {
      return database.dose_logs.where("profileId").equals(profileId).toArray();
    }
    return database.dose_logs.toArray();
  }

  async recordDoseTaken(
    profileId: number,
    medicationId: number,
    dataHoraIso?: string,
  ): Promise<number> {
    const timestamp = dataHoraIso || new Date().toISOString();
    return database.transaction("rw", database.medications, database.dose_logs, async () => {
      const med = await database.medications.get(medicationId);
      if (med) {
        const step = med.quantidadePorDose || 1;
        const newStock = Math.max(0, Number((med.estoqueAtual - step).toFixed(2)));
        await database.medications.update(medicationId, { estoqueAtual: newStock });
      }
      return database.dose_logs.add({
        profileId,
        medicationId,
        dataHoraPrevista: timestamp,
        dataHoraTomada: timestamp,
        status: "tomado",
      });
    });
  }

  async getChatHistory(profileId?: number, limit = 20): Promise<ChatHistoryEntry[]> {
    if (profileId !== undefined) {
      const entries = await database.chat_history
        .where("profileId")
        .equals(profileId)
        .reverse()
        .limit(limit)
        .toArray();
      return entries.reverse();
    }
    const entries = await database.chat_history.reverse().limit(limit).toArray();
    return entries.reverse();
  }

  async addChatEntry(entry: Omit<ChatHistoryEntry, "id">): Promise<number> {
    return database.chat_history.add(entry as ChatHistoryEntry);
  }

  async clearChatHistory(profileId?: number): Promise<void> {
    if (profileId !== undefined) {
      await database.chat_history.where("profileId").equals(profileId).delete();
    } else {
      await database.chat_history.clear();
    }
  }
}

export const storageRepository: IStorageRepository = new DexieStorageRepository();
