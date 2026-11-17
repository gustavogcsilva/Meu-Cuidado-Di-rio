import { database, ensureDefaultProfiles } from "./database";
import type { Medication } from "../types/medication";

export async function insertSampleMedications(targetProfileId?: number): Promise<number> {
  const profiles = await ensureDefaultProfiles();
  const euProfile = profiles.find((p) => p.parentesco === "proprio") ?? profiles[0];
  const maeProfile = profiles.find((p) => p.parentesco === "idoso") ?? euProfile;
  const filhoProfile = profiles.find((p) => p.parentesco === "filho") ?? euProfile;

  const sampleMedications: Medication[] = [
    {
      profileId: targetProfileId ?? filhoProfile.id ?? 1,
      nome: "Dipirona",
      dosagem: "500mg/ml",
      unidade: "gotas",
      quantidadePorDose: 15,
      origemPrescricao: "emergencia",
      condicaoTratamento: "Dor / Febre",
      tipo: "temporario",
      controlado: false,
      tipoReceita: "simples",
      intervaloHoras: 8,
      horarios: ["08:00", "16:00", "23:00"],
      duracaoDias: 3,
      estoqueAtual: 200,
      estoqueTotal: 200,
      alertaEstoqueMinimo: 45,
      dataInicio: new Date().toISOString().slice(0, 10),
      ativo: true,
    },
    {
      profileId: targetProfileId ?? maeProfile.id ?? 1,
      nome: "Gardenal",
      dosagem: "100mg",
      unidade: "comprimido",
      quantidadePorDose: 1,
      origemPrescricao: "especializado",
      condicaoTratamento: "Alzheimer / Neurologia",
      tipo: "continuo",
      controlado: true,
      tipoReceita: "branca_2_vias",
      intervaloHoras: 24,
      horarios: ["08:00"],
      estoqueAtual: 40,
      estoqueTotal: 40,
      alertaEstoqueMinimo: 10,
      dataInicio: new Date().toISOString().slice(0, 10),
      ativo: true,
    },
  ];

  return database.transaction("rw", database.medications, async () => {
    const existing = await database.medications
      .where("nome")
      .anyOf(sampleMedications.map(({ nome }) => nome))
      .toArray();
    const existingNames = new Set(existing.map(({ nome }) => nome));
    const newSamples = sampleMedications.filter(({ nome }) => !existingNames.has(nome));

    if (newSamples.length > 0) {
      await database.medications.bulkAdd(newSamples);
    }

    return newSamples.length;
  });
}
