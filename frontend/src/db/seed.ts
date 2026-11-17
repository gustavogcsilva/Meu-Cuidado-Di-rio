import { database, ensureDefaultProfiles } from "./database";
import type { Medication } from "../types/medication";

export async function insertSampleMedications(targetProfileId?: number): Promise<number> {
  const profiles = await ensureDefaultProfiles();
  const euProfile = profiles.find((p) => p.parentesco === "proprio") ?? profiles[0];
  const maeProfile = profiles.find((p) => p.parentesco === "idoso") ?? euProfile;

  const defaultPid = targetProfileId ?? maeProfile.id ?? euProfile.id ?? 1;
  const todayStr = new Date().toISOString().slice(0, 10);

  const sampleMedications: Medication[] = [
    {
      profileId: defaultPid,
      nome: "Gardenal",
      dosagem: "100mg",
      corIdentificacao: "#7c3aed", // Roxo -> GAR
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
      estoqueTotal: 20, // 20 por caixa -> 40 comp. (2 caixas)
      alertaEstoqueMinimo: 10,
      dataInicio: todayStr,
      ativo: true,
    },
    {
      profileId: defaultPid,
      nome: "Escitalopram",
      dosagem: "10mg",
      corIdentificacao: "#2563eb", // Azul -> ESC
      unidade: "comprimido",
      quantidadePorDose: 1,
      origemPrescricao: "especializado",
      condicaoTratamento: "Ansiedade / Sono",
      tipo: "continuo",
      controlado: true,
      tipoReceita: "branca_2_vias",
      intervaloHoras: 24,
      horarios: ["08:00"],
      estoqueAtual: 30,
      estoqueTotal: 30,
      alertaEstoqueMinimo: 8,
      dataInicio: todayStr,
      ativo: true,
    },
    {
      profileId: defaultPid,
      nome: "Dipirona",
      dosagem: "500mg/ml",
      corIdentificacao: "#059669", // Esmeralda -> DIP
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
      dataInicio: todayStr,
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
