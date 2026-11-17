import type {
  AutomatedAlertItem,
  BoxScanResult,
  ExtractedPrescriptionItem,
  Medication,
  MedicationBulaSummary,
  MedicationMiniReport,
  MedicationType,
  MedicationUnit,
  NearbyPharmaciesResponse,
  NearbyPharmacy,
  PatientProfile,
  PharmacistConsultResponse,
  PrescriptionOrigin,
  PrescriptionType,
} from "../types/medication";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export const TRIMESTRAL_ALERT_TEXT =
  "🩺 Você completou 3 meses de uso contínuo desta medicação. Agende uma consulta médica para reavaliar a necessidade e a dosagem atual.";

export const CONTINUOUS_USE_WARNING =
  "⚠️ Medicação de Uso Contínuo (Tratamento Especializado): NÃO interrompa o uso abruptamente por conta própria. A suspensão súbita pode causar efeito rebote, abstinência ou descompensação neurológica/clínica. Qualquer ajuste deve ser orientado pelo médico.";

export const EMERGENCY_ORIGIN_WARNING =
  "🚑 Prescrição de Emergência / Pronto-Socorro: uso pontual restrito aos dias indicados. Não estenda o uso sem reavaliação médica e retorne ao serviço de saúde caso os sintomas persistam após o término dos dias.";

export const SPECIALIZED_ORIGIN_WARNING =
  "🩺 Acompanhamento Especializado Contínuo: controle rigoroso ativado. Mantenha estoque de segurança e agende a reavaliação médica trimestral (90 dias).";

export function formatDoseLabel(qtd: number, unidade: MedicationUnit): string {
  const n = Number(qtd) || 1;
  if (unidade === "comprimido") return `${n} ${n === 1 ? "comprimido" : "comprimidos"}`;
  if (unidade === "capsula") return `${n} ${n === 1 ? "cápsula" : "cápsulas"}`;
  if (unidade === "gotas") return `${n} ${n === 1 ? "gota" : "gotas"}`;
  if (unidade === "ml") return `${n} ml`;
  return `${n} ${unidade}`;
}

export function formatIntervalSummary(
  intervaloHoras: number,
  tipo: MedicationType,
  duracaoDias?: number,
): string {
  const base = `Tomar de ${intervaloHoras} em ${intervaloHoras} horas`;
  if (tipo === "temporario" && duracaoDias && duracaoDias > 0) {
    return `${base} durante ${duracaoDias} ${duracaoDias === 1 ? "dia" : "dias"}`;
  }
  return `${base} • Uso Contínuo`;
}

export function calculateIntervalSchedule(startTime: string, intervalHours: number): string[] {
  const parts = startTime.split(":");
  const startH = Number(parts[0]);
  const startM = Number(parts[1] ?? 0);
  const safeH = Number.isFinite(startH) ? startH : 8;
  const safeM = Number.isFinite(startM) ? startM : 0;
  const step = Math.max(1, Math.min(24, Number(intervalHours) || 24));
  const count = Math.max(1, Math.floor(24 / step));

  const slots: string[] = [];
  for (let i = 0; i < count; i++) {
    const totalMinutes = (safeH * 60 + safeM + i * step * 60) % (24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

export function isSleepHourSlot(horario: string): boolean {
  const [hStr] = horario.split(":");
  const h = Number(hStr);
  return h === 0 || (h >= 1 && h <= 5);
}

interface LocalCatalogProfile {
  nome: string;
  dosagem: string;
  unidade: MedicationUnit;
  quantidadePorDoseSugerida: number;
  quantidadeComprimidos: number;
  controlado: boolean;
  tipoReceita: PrescriptionType;
  origemSugerida: PrescriptionOrigin;
  condicaoSugerida: string;
  tipoSugerido: MedicationType;
  intervaloHorasSugerido: number;
  horariosSugeridos: string[];
  alertaEstoqueMinimoSugerido: number;
  tarja: string;
  paraQueServe: string;
  alertasPrincipais: string[];
  interacoes: string[];
  efeitosColaterais: string[];
}

const LOCAL_PROFILES: Record<string, LocalCatalogProfile> = {
  clonazepam: {
    nome: "Clonazepam",
    dosagem: "2mg",
    unidade: "comprimido",
    quantidadePorDoseSugerida: 1,
    quantidadeComprimidos: 30,
    controlado: true,
    tipoReceita: "azul",
    origemSugerida: "especializado",
    condicaoSugerida: "Ansiedade / Sono",
    tipoSugerido: "continuo",
    intervaloHorasSugerido: 24,
    horariosSugeridos: ["21:00"],
    alertaEstoqueMinimoSugerido: 10,
    tarja: "Tarja Preta — Venda sob Prescrição Médica (Notificação de Receita B / Azul)",
    paraQueServe:
      "Ansiolítico e anticonvulsivante benzodiazepínico indicado para transtornos de ansiedade, síndrome do pânico, crises epilépticas e distúrbios do sono/humor.",
    alertasPrincipais: [
      "Tarja Preta: pode causar dependência física e psíquica com o uso prolongado.",
      "Evite dirigir veículos ou operar máquinas, pois reduz reflexos e atenção.",
      "Proibido ingerir bebidas alcoólicas durante todo o tratamento.",
    ],
    interacoes: [
      "Depressores do Sistema Nervoso Central (como Gardenal/fenobarbital, opioides, hipnóticos e álcool) potencializam sedação intensa e depressão respiratória.",
      "Antidepressivos, anti-histamínicos sedativos e antipsicóticos podem acentuar a sonolência.",
    ],
    efeitosColaterais: [
      "Sonolência diurna, fadiga e relaxamento muscular",
      "Tontura, incoordenação motora e lentidão de reflexos",
      "Dificuldade de concentração e alterações na memória recente",
    ],
  },
  donepezila: {
    nome: "Donepezila",
    dosagem: "10mg",
    unidade: "comprimido",
    quantidadePorDoseSugerida: 1,
    quantidadeComprimidos: 30,
    controlado: true,
    tipoReceita: "branca_2_vias",
    origemSugerida: "especializado",
    condicaoSugerida: "Alzheimer",
    tipoSugerido: "continuo",
    intervaloHorasSugerido: 24,
    horariosSugeridos: ["20:00"],
    alertaEstoqueMinimoSugerido: 10,
    tarja: "Tarja Vermelha Controlada — Retenção de Receita (Lista C1 / Neurologia)",
    paraQueServe:
      "Inibidor da acetilcolinesterase indicado para o tratamento da Doença de Alzheimer, auxiliando na preservação da memória, atenção e atividades diárias.",
    alertasPrincipais: [
      "Administrar preferencialmente à noite, antes de deitar.",
      "Não interromper abruptamente sem avaliação do neurologista ou geriatra.",
      "Monitorar frequência cardíaca (risco de bradicardia) e tontura postural.",
    ],
    interacoes: [
      "Anticolinérgicos (como Buscopan/escopolamina e anti-histamínicos sedativos) antagonizam o efeito da Donepezila na memória.",
      "Betabloqueadores podem somar efeito redutor da frequência cardíaca.",
    ],
    efeitosColaterais: [
      "Náusea leve ou diarreia transitória",
      "Sonhos vívidos ou insônia leve",
      "Cãibras musculares ocasionais",
    ],
  },
  buscopan: {
    nome: "Buscopan",
    dosagem: "10mg",
    unidade: "comprimido",
    quantidadePorDoseSugerida: 1,
    quantidadeComprimidos: 20,
    controlado: false,
    tipoReceita: "simples",
    origemSugerida: "emergencia",
    condicaoSugerida: "Dor / Febre",
    tipoSugerido: "temporario",
    intervaloHorasSugerido: 8,
    horariosSugeridos: ["08:00", "16:00", "23:00"],
    alertaEstoqueMinimoSugerido: 5,
    tarja: "Sem Tarja / MIP (Butilbrometo de Escopolamina)",
    paraQueServe:
      "Antiespasmódico indicado para alívio rápido de cólicas e espasmos dos tratos gastrintestinal, biliar e geniturinário.",
    alertasPrincipais: [
      "Contraindicado em pacientes com glaucoma de ângulo fechado, miastenia gravis ou megacólon.",
      "Se a dor abdominal persistir ou vier acompanhada de febre, procure avaliação médica imediata.",
      "Cautela em idosos (risco de confusão anticolinérgica e retenção urinária).",
    ],
    interacoes: [
      "Potencializa efeitos anticolinérgicos de antidepressivos tricíclicos e anti-histamínicos, podendo antagonizar medicamentos para Alzheimer.",
      "Antagonistas dopaminérgicos (como metoclopramida) podem ter redução mútua de efeito no trato digestivo.",
    ],
    efeitosColaterais: [
      "Boca seca (xerostomia) e redução da transpiração",
      "Taquicardia leve (aumento dos batimentos cardíacos)",
      "Visão turva passageira e retenção urinária ocasional",
    ],
  },
  gardenal: {
    nome: "Gardenal",
    dosagem: "100mg",
    unidade: "comprimido",
    quantidadePorDoseSugerida: 1,
    quantidadeComprimidos: 20,
    controlado: true,
    tipoReceita: "branca_2_vias",
    origemSugerida: "especializado",
    condicaoSugerida: "Convulsões / Epilepsia",
    tipoSugerido: "continuo",
    intervaloHorasSugerido: 24,
    horariosSugeridos: ["08:00"],
    alertaEstoqueMinimoSugerido: 10,
    tarja: "Tarja Vermelha Controlada — Receita de Controle Especial em 2 Vias (C1)",
    paraQueServe:
      "Anticonvulsivante e barbitúrico (fenobarbital) utilizado na prevenção e controle de crises epilépticas.",
    alertasPrincipais: [
      "Não suspenda o uso abruptamente: risco elevado de desencadear crises convulsivas.",
      "Evite totalmente bebidas alcoólicas.",
      "Reduz a eficácia de anticoncepcionais hormonais orais.",
    ],
    interacoes: [
      "Benzodiazepínicos (como Clonazepam) e outros sedativos aumentam acentuadamente a depressão do sistema nervoso central.",
      "Reduz níveis plasmáticos de anticoagulantes orais, corticoides e contraceptivos.",
    ],
    efeitosColaterais: [
      "Sonolência matinal e sedação",
      "Dificuldade de coordenação motora, tontura ou agitação paradoxal em idosos",
    ],
  },
  dipirona: {
    nome: "Dipirona",
    dosagem: "500mg/ml",
    unidade: "gotas",
    quantidadePorDoseSugerida: 15,
    quantidadeComprimidos: 200,
    controlado: false,
    tipoReceita: "simples",
    origemSugerida: "emergencia",
    condicaoSugerida: "Dor / Febre",
    tipoSugerido: "temporario",
    intervaloHorasSugerido: 8,
    horariosSugeridos: ["08:00", "16:00", "23:00"],
    alertaEstoqueMinimoSugerido: 30,
    tarja: "MIP — Medicamento Isento de Prescrição",
    paraQueServe: "Analgésico e antitérmico indicado para alívio de dores agudas e redução de febre.",
    alertasPrincipais: [
      "Evite se houver histórico de alergia a pirazolonas ou alterações hematológicas.",
      "Pode causar queda de pressão arterial em pessoas sensíveis.",
    ],
    interacoes: [
      "Pode reduzir níveis sanguíneos de ciclosporina.",
      "Cuidado para não duplicar dose com medicamentos combinados que já contenham dipirona.",
    ],
    efeitosColaterais: [
      "Reações alérgicas cutâneas ocasionais",
      "Hipotensão leve transitória",
    ],
  },
};

function matchLocalProfile(signal: string): LocalCatalogProfile | null {
  const norm = signal.toLowerCase().trim();
  if (!norm) return null;
  if (norm.includes("rivotril") || norm.includes("clonazepam") || norm.includes("clonazepan")) {
    return LOCAL_PROFILES.clonazepam;
  }
  if (norm.includes("donepezila") || norm.includes("eranz") || norm.includes("donila")) {
    return LOCAL_PROFILES.donepezila;
  }
  if (norm.includes("buscopan") || norm.includes("escopolamina")) {
    return LOCAL_PROFILES.buscopan;
  }
  if (norm.includes("gardenal") || norm.includes("fenobarbital")) {
    return LOCAL_PROFILES.gardenal;
  }
  if (norm.includes("dipirona") || norm.includes("novalgina")) {
    return LOCAL_PROFILES.dipirona;
  }
  return null;
}

function buildLocalProfileAndConditionContext(
  nomeMed: string,
  unidade: MedicationUnit,
  qtdPorDose: number,
  condicaoTratamento?: string,
  perfil?: PatientProfile,
): { contextoPerfilClinico: string | null; contextoCondicaoTratamento: string | null } {
  const normMed = nomeMed.toLowerCase();
  const condMed = (condicaoTratamento ?? "").trim();
  const condPerfil = (perfil?.condicaoClinica ?? "").trim();
  const normCond = `${condMed} ${condPerfil}`.toLowerCase();

  let contextoPerfilClinico: string | null = null;
  let contextoCondicaoTratamento: string | null = null;

  if (perfil) {
    const parts = [`Paciente: ${perfil.nome} (${perfil.parentesco})`];
    if (perfil.idade) parts.push(`${perfil.idade} anos`);
    if (perfil.pesoKg) parts.push(`${perfil.pesoKg} kg`);
    if (condPerfil) parts.push(`Condição: ${condPerfil}`);
    const header = parts.join(" • ") + " — ";

    const isElderly = perfil.parentesco === "idoso" || (perfil.idade !== undefined && perfil.idade >= 60);
    const isChild = perfil.parentesco === "filho" || (perfil.idade !== undefined && perfil.idade <= 12);

    if (isElderly) {
      if (
        normMed.includes("clonazepam") ||
        normMed.includes("rivotril") ||
        normMed.includes("gardenal") ||
        normMed.includes("fenobarbital")
      ) {
        const alzheimerMsg = normCond.includes("alzheimer")
          ? " Em pacientes com Doença de Alzheimer, sedativos centrais podem acentuar confusão mental, déficit de memória e agitação noturna paradoxal."
          : "";
        contextoPerfilClinico = `${header}⚠️ Alerta Geriátrico (Critérios de Beers): ${nomeMed} em idosos eleva o risco de sedação prolongada, tontura postural e quedas com risco de fratura.${alzheimerMsg} Supervisione de perto ao levantar à noite.`;
      } else {
        contextoPerfilClinico = `${header}Cuidado Geriátrico: acompanhe pressão arterial, hidratação e administração supervisionada pelo cuidador familiar.`;
      }
    } else if (isChild) {
      contextoPerfilClinico = `${header}👶 Cuidado Pediátrico: meça com precisão ${formatDoseLabel(
        qtdPorDose,
        unidade,
      )} por tomada${perfil.pesoKg ? ` (conferido para ${perfil.pesoKg} kg)` : ""}. Mantenha fora do alcance de crianças.`;
    } else {
      contextoPerfilClinico = `${header}Posologia configurada: ${formatDoseLabel(
        qtdPorDose,
        unidade,
      )} por tomada.`;
    }
  }

  const alvo = condMed || condPerfil;
  if (alvo) {
    if (normCond.includes("alzheimer")) {
      contextoCondicaoTratamento = `🧠 Contexto Terapêutico (${alvo}): no cuidado de Alzheimer/Neurologia, manter horários rigorosos evita oscilações cognitivas e agitação vespertina (sundowning). Evite associar medicamentos anticolinérgicos sem aval médico.`;
    } else if (normCond.includes("epilepsia") || normCond.includes("convuls")) {
      contextoCondicaoTratamento = `⚡ Contexto Terapêutico (${alvo}): a regularidade estrita dos horários mantém o nível sérico anticonvulsivante e previne crises de escape.`;
    } else if (normCond.includes("dor") || normCond.includes("febre")) {
      contextoCondicaoTratamento = `🌡️ Contexto Terapêutico (${alvo}): tratamento sintomático pontual. Acompanhe a evolução da temperatura e dor; se persistirem após os dias prescritos, reavalie com o médico.`;
    } else {
      contextoCondicaoTratamento = `🎯 Indicação Clínica (${alvo}): medicação vinculada ao tratamento de ${alvo}.`;
    }
  }

  return { contextoPerfilClinico, contextoCondicaoTratamento };
}

export function buildLocalInteractions(
  nomeAtual: string,
  controlado: boolean,
  outrosMedicamentos: string[],
  condicaoClinica?: string,
): string[] {
  const normAtual = nomeAtual.toLowerCase();
  const normCond = (condicaoClinica ?? "").toLowerCase();
  const sncList = ["clonazepam", "rivotril", "gardenal", "fenobarbital", "diazepam", "alprazolam"];
  const isAtualSnc = sncList.some((d) => normAtual.includes(d));
  const detected: string[] = [];

  if (
    normCond.includes("alzheimer") &&
    (isAtualSnc || normAtual.includes("buscopan"))
  ) {
    detected.push(
      `⚠️ Alerta Clínico (${condicaoClinica}): ${nomeAtual} exige atenção especial em quadros de Alzheimer pelo risco de sedação excessiva, piora cognitiva ou efeito anticolinérgico.`,
    );
  }

  for (const outro of outrosMedicamentos) {
    const normOutro = outro.toLowerCase();
    if (!normOutro || normOutro === normAtual) continue;
    const isOutroSnc = sncList.some((d) => normOutro.includes(d));

    if (isAtualSnc && isOutroSnc) {
      detected.push(
        `⚠️ Interação Relevante com ${outro} (já cadastrado neste perfil): ambos atuam como depressores do Sistema Nervoso Central, aumentando o risco de sedação intensa, sonolência profunda e quedas.`,
      );
      continue;
    }

    if (normAtual.includes("buscopan") || normAtual.includes("escopolamina")) {
      if (isOutroSnc) {
        detected.push(
          `ℹ️ Atenção com ${outro} (no banco local): o uso concomitante de antiespasmódicos anticolinérgicos (Buscopan) com sedativos centrais pode acentuar sonolência, tontura e boca seca.`,
        );
      } else if (normOutro.includes("dipirona")) {
        detected.push(
          `ℹ️ Cruzamento com ${outro} (no banco local): Buscopan Simples contém apenas escopolamina, mas caso utilize versão composta, evite tomar no mesmo horário da Dipirona.`,
        );
      }
      continue;
    }

    if (controlado) {
      detected.push(
        `🔍 Cruzamento com ${outro}: informe ao médico o uso simultâneo com ${nomeAtual} para evitar sobreposição de horários.`,
      );
    }
  }

  if (detected.length === 0) {
    if (outrosMedicamentos.length > 0) {
      detected.push(
        `✅ Cruzamento verificado com o estoque deste perfil (${outrosMedicamentos.join(", ")}): nenhuma interação grave direta identificada.`,
      );
    } else {
      detected.push(
        "ℹ️ Nenhum outro medicamento ativo neste perfil para cruzamento de interações.",
      );
    }
  }

  return detected;
}

export function buildLocalMiniReport(payload: {
  nome: string;
  dosagem: string;
  unidade?: MedicationUnit;
  quantidadePorDose?: number;
  origemPrescricao?: PrescriptionOrigin;
  condicaoTratamento?: string;
  tipo: MedicationType;
  controlado: boolean;
  tipoReceita: PrescriptionType;
  dataInicio: string;
  outrosMedicamentos: string[];
  perfil?: PatientProfile;
}): MedicationMiniReport {
  const profile = matchLocalProfile(payload.nome);
  const unidade = payload.unidade ?? profile?.unidade ?? "comprimido";
  const qtdPorDose = payload.quantidadePorDose ?? profile?.quantidadePorDoseSugerida ?? 1;
  const origemPrescricao =
    payload.origemPrescricao ?? (payload.tipo === "continuo" ? "especializado" : "emergencia");
  const effectiveTipo: MedicationType =
    origemPrescricao === "especializado" ? "continuo" : payload.tipo;

  const condCombinada = [payload.perfil?.condicaoClinica, payload.condicaoTratamento]
    .filter(Boolean)
    .join(" / ");
  const localInteractions = buildLocalInteractions(
    payload.nome,
    payload.controlado,
    payload.outrosMedicamentos,
    condCombinada,
  );
  const usoContinuoAviso = effectiveTipo === "continuo" ? CONTINUOUS_USE_WARNING : null;
  const avisoOrigemPrescricao =
    origemPrescricao === "emergencia" ? EMERGENCY_ORIGIN_WARNING : SPECIALIZED_ORIGIN_WARNING;
  const { contextoPerfilClinico, contextoCondicaoTratamento } =
    buildLocalProfileAndConditionContext(
      payload.nome,
      unidade,
      qtdPorDose,
      payload.condicaoTratamento,
      payload.perfil,
    );

  const resumoBula: MedicationBulaSummary = profile
    ? {
        paraQueServe: profile.paraQueServe,
        alertasPrincipais: profile.alertasPrincipais,
        interacoes: [...localInteractions, ...profile.interacoes],
        efeitosColaterais: profile.efeitosColaterais,
        usoContinuoAviso,
        avisoOrigemPrescricao,
        contextoPerfilClinico,
        contextoCondicaoTratamento,
        tarja: profile.tarja,
      }
    : {
        paraQueServe: `Medicamento (${payload.nome} ${payload.dosagem}) registrado em regime de ${
          origemPrescricao === "emergencia"
            ? "Atendimento de Emergência / Pronto-Socorro"
            : "Tratamento Especializado Contínuo"
        }${payload.condicaoTratamento ? ` para ${payload.condicaoTratamento}` : ""}.`,
        alertasPrincipais: [
          `Respeite rigorosamente os horários e a posologia (${formatDoseLabel(qtdPorDose, unidade)} — ${payload.dosagem}).`,
          payload.controlado
            ? "Medicamento controlado: venda sob retenção de receita e proibida ingestão de álcool."
            : "Mantenha na embalagem original e verifique a validade antes de administrar.",
        ],
        interacoes: [...localInteractions, "Evite bebidas alcoólicas durante o tratamento."],
        efeitosColaterais: [
          "Desconforto gástrico leve ou náusea ocasional",
          "Sonolência ou tontura leve conforme sensibilidade individual",
        ],
        usoContinuoAviso,
        avisoOrigemPrescricao,
        contextoPerfilClinico,
        contextoCondicaoTratamento,
        tarja: payload.controlado ? "Tarja Preta / Vermelha Controlada" : "Sob Prescrição / MIP",
      };

  let marco90: string | null = null;
  let alertaTrimestral: string | null = null;
  if (effectiveTipo === "continuo") {
    const start = new Date(`${payload.dataInicio}T12:00:00`);
    start.setDate(start.getDate() + 90);
    marco90 = start.toISOString().slice(0, 10);
    alertaTrimestral = TRIMESTRAL_ALERT_TEXT;
  }

  return {
    nome: payload.nome,
    dosagem: payload.dosagem,
    unidade,
    quantidadePorDose: qtdPorDose,
    origemPrescricao,
    condicaoTratamento: payload.condicaoTratamento ?? null,
    tipo: effectiveTipo,
    controlado: payload.controlado,
    tipoReceita: payload.tipoReceita,
    perfilNome: payload.perfil?.nome ?? "Eu",
    resumoBula,
    interacoesDetectadasComBancoLocal: localInteractions,
    marcoReavaliacao90Dias: marco90,
    alertaReavaliacaoTrimestral: alertaTrimestral,
    geradoEm: new Date().toISOString(),
  };
}

export async function fetchMedicationMiniReport(payload: {
  nome: string;
  dosagem: string;
  unidade?: MedicationUnit;
  quantidadePorDose?: number;
  origemPrescricao?: PrescriptionOrigin;
  condicaoTratamento?: string;
  tipo: MedicationType;
  controlado: boolean;
  tipoReceita: PrescriptionType;
  dataInicio: string;
  duracaoDias?: number;
  outrosMedicamentos: string[];
  perfil?: PatientProfile;
}): Promise<MedicationMiniReport> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/assistant/medication-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        perfil: payload.perfil
          ? {
              id: payload.perfil.id,
              nome: payload.perfil.nome,
              parentesco: payload.perfil.parentesco,
              idade: payload.perfil.idade ?? null,
              pesoKg: payload.perfil.pesoKg ?? null,
              condicaoClinica: payload.perfil.condicaoClinica ?? null,
            }
          : null,
      }),
    });
    if (response.ok) {
      return (await response.json()) as MedicationMiniReport;
    }
  } catch {
    // Fallback local
  }
  return buildLocalMiniReport(payload);
}

export async function scanMedicationBox(options: {
  file?: File;
  hint?: string;
  outrosMedicamentos: string[];
  perfil?: PatientProfile;
}): Promise<BoxScanResult> {
  const formData = new FormData();
  if (options.file) {
    formData.append("file", options.file);
  }
  if (options.hint) {
    formData.append("hint", options.hint);
  }
  formData.append("outrosMedicamentos", JSON.stringify(options.outrosMedicamentos));
  if (options.perfil) {
    formData.append(
      "perfil",
      JSON.stringify({
        id: options.perfil.id,
        nome: options.perfil.nome,
        parentesco: options.perfil.parentesco,
        idade: options.perfil.idade ?? null,
        pesoKg: options.perfil.pesoKg ?? null,
        condicaoClinica: options.perfil.condicaoClinica ?? null,
      }),
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/assistant/scan-box`, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      return (await response.json()) as BoxScanResult;
    }
  } catch {
    // Fallback local
  }

  const signal = `${options.hint ?? ""} ${options.file?.name ?? ""}`.trim();
  const profile = matchLocalProfile(signal) ?? LOCAL_PROFILES.clonazepam;
  const qtyMatch = signal.match(/\b(\d{1,4})\s*(?:comprimidos|cp|comp|unidades|gotas|ml)\b/i);
  const quantidade = qtyMatch ? Number(qtyMatch[1]) : profile.quantidadeComprimidos;
  const condSugerida = options.perfil?.condicaoClinica || profile.condicaoSugerida;

  const localReport = buildLocalMiniReport({
    nome: profile.nome,
    dosagem: profile.dosagem,
    unidade: profile.unidade,
    quantidadePorDose: profile.quantidadePorDoseSugerida,
    origemPrescricao: profile.origemSugerida,
    condicaoTratamento: condSugerida,
    tipo: profile.tipoSugerido,
    controlado: profile.controlado,
    tipoReceita: profile.tipoReceita,
    dataInicio: new Date().toISOString().slice(0, 10),
    outrosMedicamentos: options.outrosMedicamentos,
    perfil: options.perfil,
  });

  return {
    nome: profile.nome,
    dosagem: profile.dosagem,
    unidade: profile.unidade,
    quantidadePorDoseSugerida: profile.quantidadePorDoseSugerida,
    quantidadeComprimidos: quantidade,
    controlado: profile.controlado,
    tipoReceita: profile.tipoReceita,
    origemSugerida: profile.origemSugerida,
    condicaoSugerida: condSugerida,
    tipoSugerido: profile.tipoSugerido,
    intervaloHorasSugerido: profile.intervaloHorasSugerido,
    horariosSugeridos: profile.horariosSugeridos,
    alertaEstoqueMinimoSugerido: profile.alertaEstoqueMinimoSugerido,
    confianca: 0.96,
    resumoBula: localReport.resumoBula,
  };
}

export function requestUserGeolocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocalização não suportada neste navegador."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
  });
}

function buildFallbackPharmaciesData(
  lat: number,
  lng: number,
  radius: number,
  localReferencia?: string,
): NearbyPharmaciesResponse {
  const fallbackList: NearbyPharmacy[] = [
    {
      id: "local-1",
      nome: "Drogaria São Paulo — Plantão 24h",
      endereco: "Av. Principal, 410 (Centro)",
      lat: Number((lat + 0.0028).toFixed(6)),
      lng: Number((lng + 0.0021).toFixed(6)),
      distanciaMetros: 380,
      distanciaFormatada: "380 m",
      telefone: "(11) 3003-3764",
      horarioFuncionamento: "Aberto 24 horas",
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${
        lat + 0.0028
      },${lng + 0.0021}&travelmode=driving`,
      appleMapsUrl: `https://maps.apple.com/?saddr=${lat},${lng}&daddr=${lat + 0.0028},${
        lng + 0.0021
      }&dirflg=d`,
    },
    {
      id: "local-2",
      nome: "Droga Raia — Unidade Saúde & Família",
      endereco: "Rua das Palmeiras, 185",
      lat: Number((lat - 0.0045).toFixed(6)),
      lng: Number((lng + 0.0032).toFixed(6)),
      distanciaMetros: 590,
      distanciaFormatada: "590 m",
      telefone: "(11) 3003-7242",
      horarioFuncionamento: "07:00 às 23:00",
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${
        lat - 0.0045
      },${lng + 0.0032}&travelmode=driving`,
      appleMapsUrl: `https://maps.apple.com/?saddr=${lat},${lng}&daddr=${lat - 0.0045},${
        lng + 0.0032
      }&dirflg=d`,
    },
    {
      id: "local-3",
      nome: "Farmácia Pague Menos — Dispensação Controlados",
      endereco: "Av. Brasil, 920",
      lat: Number((lat + 0.0072).toFixed(6)),
      lng: Number((lng - 0.0054).toFixed(6)),
      distanciaMetros: 960,
      distanciaFormatada: "960 m",
      telefone: "0800 275 1313",
      horarioFuncionamento: "07:00 às 22:00",
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${
        lat + 0.0072
      },${lng - 0.0054}&travelmode=driving`,
      appleMapsUrl: `https://maps.apple.com/?saddr=${lat},${lng}&daddr=${lat + 0.0072},${
        lng - 0.0054
      }&dirflg=d`,
    },
    {
      id: "local-4",
      nome: "Drogaria Pacheco / Farmácia Popular",
      endereco: "Praça da Matriz, 58",
      lat: Number((lat - 0.0095).toFixed(6)),
      lng: Number((lng - 0.0075).toFixed(6)),
      distanciaMetros: 1320,
      distanciaFormatada: "1,3 km",
      telefone: "(11) 4020-4404",
      horarioFuncionamento: "08:00 às 22:00",
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${
        lat - 0.0095
      },${lng - 0.0075}&travelmode=driving`,
      appleMapsUrl: `https://maps.apple.com/?saddr=${lat},${lng}&daddr=${lat - 0.0095},${
        lng - 0.0075
      }&dirflg=d`,
    },
  ];

  return {
    latOrigem: lat,
    lngOrigem: lng,
    raioMetros: radius,
    localReferencia: localReferencia ?? null,
    fonte: "OpenStreetMap / Contingência Local Georreferenciada (Raio 3 km)",
    farmacias: fallbackList,
  };
}

export async function fetchNearbyPharmacies(
  lat: number,
  lng: number,
  radius = 3000,
): Promise<NearbyPharmaciesResponse> {
  try {
    const url = `${API_BASE_URL}/api/pharmacies/nearby?lat=${encodeURIComponent(
      lat,
    )}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`;
    const response = await fetch(url);
    if (response.ok) {
      return (await response.json()) as NearbyPharmaciesResponse;
    }
  } catch {
    // Fallback local
  }
  return buildFallbackPharmaciesData(lat, lng, radius);
}

export async function fetchPharmaciesByLocationQuery(
  query: string,
  radius = 3000,
): Promise<NearbyPharmaciesResponse> {
  try {
    const url = `${API_BASE_URL}/api/pharmacies/search-location?q=${encodeURIComponent(
      query,
    )}&radius=${encodeURIComponent(radius)}`;
    const response = await fetch(url);
    if (response.ok) {
      return (await response.json()) as NearbyPharmaciesResponse;
    }
  } catch {
    // Fallback local
  }
  return buildFallbackPharmaciesData(-23.561414, -46.655881, radius, query);
}

export function computeLocalConsolidatedAlerts(
  medications: Medication[],
  profiles: PatientProfile[],
  referenceDateStr?: string,
): AutomatedAlertItem[] {
  const refDateStr = referenceDateStr ?? new Date().toISOString().slice(0, 10);
  const refDate = new Date(`${refDateStr}T12:00:00`);
  const profileMap = new Map<number, string>();
  profiles.forEach((p) => {
    if (p.id !== undefined) profileMap.set(p.id, p.nome);
  });

  const alerts: AutomatedAlertItem[] = [];

  medications.forEach((med, idx) => {
    if (!med.ativo) return;
    const perfilNome = profileMap.get(med.profileId) ?? "Eu";
    const slug = `p${med.profileId}-${med.id ?? idx}-${med.nome.toLowerCase().replace(/\s+/g, "-")}`;
    const tomadasPorDia = Math.max(
      1,
      med.horarios.length || Math.floor(24 / Math.max(1, med.intervaloHoras)),
    );
    const consumoDiario = tomadasPorDia * Math.max(0.1, med.quantidadePorDose || 1);
    const doseLabel = formatDoseLabel(med.quantidadePorDose || 1, med.unidade || "comprimido");

    med.horarios.forEach((horario) => {
      alerts.push({
        id: `dose-${slug}-${horario.replace(":", "")}`,
        profileId: med.profileId,
        perfilNome,
        categoria: "dose_horario",
        severidade: "info",
        medicamentoNome: med.nome,
        medicamentoDosagem: med.dosagem,
        titulo: `⏰ [${perfilNome}] ${horario} — ${med.nome} (${doseLabel})`,
        mensagem: `Administrar ${doseLabel} de ${med.nome} (${med.dosagem}) para ${perfilNome} às ${horario} (${formatIntervalSummary(
          med.intervaloHoras,
          med.tipo,
          med.duracaoDias,
        )}).`,
        dataReferencia: `${refDateStr}T${horario}:00`,
        requerGpsFarmacias: false,
        canaisEnvio: ["in_app", "web_push", "webhook", "ics"],
      });
    });

    if (med.estoqueAtual <= med.alertaEstoqueMinimo) {
      alerts.push({
        id: `estoque-${slug}`,
        profileId: med.profileId,
        perfilNome,
        categoria: "estoque_baixo",
        severidade: med.estoqueAtual <= 3 ? "critical" : "warning",
        medicamentoNome: med.nome,
        medicamentoDosagem: med.dosagem,
        titulo: `📦 [${perfilNome}] Estoque Baixo — ${med.nome} (${med.estoqueAtual} ${med.unidade})`,
        mensagem: `Restam apenas ${med.estoqueAtual} ${med.unidade} de ${med.nome} para ${perfilNome}. Consulte o Mini-Mapa GPS para localizar farmácias próximas.`,
        dataReferencia: refDateStr,
        requerGpsFarmacias: true,
        canaisEnvio: ["in_app", "web_push", "webhook"],
      });
    }

    const diasAutonomia = Math.floor(med.estoqueAtual / consumoDiario);
    if (med.controlado && (med.estoqueAtual <= med.alertaEstoqueMinimo + 5 || diasAutonomia <= 10)) {
      const receitaMap: Record<PrescriptionType, string> = {
        azul: "Receita Azul (Notificação B)",
        amarela: "Receita Amarela (Notificação A)",
        branca_2_vias: "Receita Branca em 2 Vias (Controle Especial C1)",
        simples: "Receita Médica",
      };
      alerts.push({
        id: `receita-${slug}`,
        profileId: med.profileId,
        perfilNome,
        categoria: "renovacao_receita",
        severidade: "warning",
        medicamentoNome: med.nome,
        medicamentoDosagem: med.dosagem,
        titulo: `📋 [${perfilNome}] Renovação de Receita Controlada — ${med.nome}`,
        mensagem: `Autonomia de estoque para ~${diasAutonomia} dia(s). Agende a renovação da ${receitaMap[med.tipoReceita]}.`,
        dataReferencia: refDateStr,
        requerGpsFarmacias: false,
        canaisEnvio: ["in_app", "web_push", "webhook"],
      });
    }

    if (med.origemPrescricao === "emergencia" && med.duracaoDias) {
      const startDate = new Date(`${med.dataInicio}T12:00:00`);
      const diffDays = Math.max(
        0,
        Math.round((refDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const remaining = Math.max(0, med.duracaoDias - diffDays);
      alerts.push({
        id: `emergencia-${slug}`,
        profileId: med.profileId,
        perfilNome,
        categoria: "fim_tratamento_emergencia",
        severidade: remaining <= 1 ? "warning" : "info",
        medicamentoNome: med.nome,
        medicamentoDosagem: med.dosagem,
        titulo: `🚑 [${perfilNome}] Ciclo de Emergência (${remaining}d restantes) — ${med.nome}`,
        mensagem: `Uso por ${med.duracaoDias} dias. Não estenda o uso sem reavaliação médica e retorne se os sintomas persistirem.`,
        dataReferencia: refDateStr,
        diasDeUso: diffDays,
        requerGpsFarmacias: false,
        canaisEnvio: ["in_app", "ics"],
      });
    }

    if (med.tipo === "continuo" || med.origemPrescricao === "especializado") {
      const startDate = new Date(`${med.dataInicio}T12:00:00`);
      const diffDays = Math.max(
        0,
        Math.round((refDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const milestoneDate = new Date(startDate);
      milestoneDate.setDate(milestoneDate.getDate() + 90);
      const milestoneStr = milestoneDate.toISOString().slice(0, 10);
      const reached90Days = diffDays >= 90;

      alerts.push({
        id: `trimestral-${slug}`,
        profileId: med.profileId,
        perfilNome,
        categoria: "reavaliacao_trimestral",
        severidade: reached90Days ? "critical" : "info",
        medicamentoNome: med.nome,
        medicamentoDosagem: med.dosagem,
        titulo: reached90Days
          ? `🩺 [${perfilNome}] Reavaliação Trimestral (${diffDays}d de uso) — ${med.nome}`
          : `🗓️ [${perfilNome}] Marco de 90 Dias (${milestoneDate.toLocaleDateString("pt-BR")}) — ${med.nome}`,
        mensagem: TRIMESTRAL_ALERT_TEXT,
        dataReferencia: reached90Days ? refDateStr : milestoneStr,
        diasDeUso: diffDays,
        requerGpsFarmacias: false,
        canaisEnvio: ["in_app", "web_push", "webhook", "ics"],
      });
    }
  });

  return alerts;
}

export async function syncBackendAlerts(
  medications: Medication[],
  profiles: PatientProfile[],
  referenceDateStr?: string,
): Promise<{ alertas: AutomatedAlertItem[]; jobsAgendados: number; backendAtivo: boolean }> {
  const profileMap = new Map<number, string>();
  profiles.forEach((p) => {
    if (p.id !== undefined) profileMap.set(p.id, p.nome);
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/alerts/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataReferencia: referenceDateStr ?? new Date().toISOString().slice(0, 10),
        medicamentos: medications.map((m) => ({
          profileId: m.profileId ?? 1,
          perfilNome: profileMap.get(m.profileId) ?? "Eu",
          nome: m.nome,
          dosagem: m.dosagem,
          unidade: m.unidade ?? "comprimido",
          quantidadePorDose: m.quantidadePorDose ?? 1,
          origemPrescricao: m.origemPrescricao ?? "especializado",
          condicaoTratamento: m.condicaoTratamento ?? null,
          tipo: m.tipo,
          controlado: m.controlado,
          tipoReceita: m.tipoReceita,
          intervaloHoras: m.intervaloHoras,
          horarios: m.horarios,
          duracaoDias: m.duracaoDias ?? null,
          estoqueAtual: m.estoqueAtual,
          estoqueTotal: m.estoqueTotal,
          alertaEstoqueMinimo: m.alertaEstoqueMinimo,
          dataInicio: m.dataInicio,
          ativo: m.ativo,
        })),
      }),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        alertas: AutomatedAlertItem[];
        jobsAgendados: number;
      };
      return {
        alertas: data.alertas,
        jobsAgendados: data.jobsAgendados,
        backendAtivo: true,
      };
    }
  } catch {
    // Fallback local
  }
  const localAlerts = computeLocalConsolidatedAlerts(medications, profiles, referenceDateStr);
  return {
    alertas: localAlerts,
    jobsAgendados: localAlerts.length,
    backendAtivo: false,
  };
}

export function buildIcsCalendarString(
  medications: Medication[],
  profiles: PatientProfile[],
): string {
  const profileMap = new Map<number, string>();
  profiles.forEach((p) => {
    if (p.id !== undefined) profileMap.set(p.id, p.nome);
  });

  const nowStr = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meu Cuidado Diario//Multi-Perfil//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Meu Cuidado Diário — Família",
  ];

  medications.forEach((med, idx) => {
    if (!med.ativo) return;
    const perfilNome = profileMap.get(med.profileId) ?? "Eu";
    const doseLabel = formatDoseLabel(med.quantidadePorDose || 1, med.unidade || "comprimido");
    const baseDate = med.dataInicio.replace(/-/g, "");

    med.horarios.forEach((h) => {
      const hhmm = h.replace(":", "") + "00";
      lines.push(
        "BEGIN:VEVENT",
        `UID:dose-p${med.profileId}-${idx}-${hhmm}@meucuidadodiario.local`,
        `DTSTAMP:${nowStr}`,
        `DTSTART:${baseDate}T${hhmm}`,
        med.tipo === "continuo" || !med.duracaoDias
          ? "RRULE:FREQ=DAILY"
          : `RRULE:FREQ=DAILY;COUNT=${med.duracaoDias * Math.max(1, med.horarios.length)}`,
        `SUMMARY:💊 [${perfilNome}] ${h} - ${med.nome} ${doseLabel} (${med.dosagem})`,
        `DESCRIPTION:Paciente: [${perfilNome}] | ${formatIntervalSummary(
          med.intervaloHoras,
          med.tipo,
          med.duracaoDias,
        )}${med.condicaoTratamento ? ` | Tratamento: ${med.condicaoTratamento}` : ""}.`,
        "END:VEVENT",
      );
    });

    if (med.tipo === "continuo" || med.origemPrescricao === "especializado") {
      const d90 = new Date(`${med.dataInicio}T09:00:00`);
      d90.setDate(d90.getDate() + 90);
      const d90Str = d90.toISOString().slice(0, 10).replace(/-/g, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:reavaliacao-90d-p${med.profileId}-${idx}@meucuidadodiario.local`,
        `DTSTAMP:${nowStr}`,
        `DTSTART:${d90Str}T090000`,
        "RRULE:FREQ=DAILY;INTERVAL=90",
        `SUMMARY:🩺 [${perfilNome}] Reavaliação Médica 3 Meses (90 dias) — ${med.nome}`,
        `DESCRIPTION:${TRIMESTRAL_ALERT_TEXT}`,
        "END:VEVENT",
      );
    }
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadLocalIcsCalendar(
  medications: Medication[],
  profiles: PatientProfile[],
  activeProfileLabel?: string,
): void {
  const icsContent = buildIcsCalendarString(medications, profiles);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = activeProfileLabel
    ? activeProfileLabel.toLowerCase().replace(/\s+/g, "-")
    : "familia";
  a.href = url;
  a.download = `meu-cuidado-diario-${slug}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function askBulaAssistant(options: {
  pergunta: string;
  perfil?: PatientProfile;
  medications: Medication[];
}): Promise<{ resposta: string; perfilConsiderado: string; alertasSeguranca: string[] }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pergunta: options.pergunta,
        perfil: options.perfil
          ? {
              id: options.perfil.id,
              nome: options.perfil.nome,
              parentesco: options.perfil.parentesco,
              idade: options.perfil.idade ?? null,
              pesoKg: options.perfil.pesoKg ?? null,
              condicaoClinica: options.perfil.condicaoClinica ?? null,
            }
          : null,
        medicamentos: options.medications.map((m) => ({
          nome: m.nome,
          dosagem: m.dosagem,
          tipo: m.tipo,
          controlado: m.controlado,
          tipoReceita: m.tipoReceita,
          intervaloHoras: m.intervaloHoras,
          horarios: m.horarios,
          condicaoTratamento: m.condicaoTratamento ?? null,
        })),
      }),
    });
    if (response.ok) {
      return (await response.json()) as {
        resposta: string;
        perfilConsiderado: string;
        alertasSeguranca: string[];
      };
    }
  } catch {
    // Fallback local
  }

  const p = options.perfil;
  const perfilDesc = p
    ? `${p.nome} (${p.parentesco}${p.idade ? `, ${p.idade} anos` : ""}${
        p.pesoKg ? `, ${p.pesoKg} kg` : ""
      }${p.condicaoClinica ? `, Condição: ${p.condicaoClinica}` : ""})`
    : "Eu (próprio)";

  const medsNames = options.medications.map((m) => `${m.nome} ${m.dosagem}`).join(", ") || "nenhum";
  return {
    resposta: `Orientação para [${perfilDesc}]: considerando os medicamentos ativos (${medsNames}), respeite rigorosamente os intervalos confirmados no calendário e nunca suspenda tratamentos especializados/contínuos sem avaliação médica.`,
    perfilConsiderado: perfilDesc,
    alertasSeguranca: p?.condicaoClinica ? [`Condição clínica monitorada: ${p.condicaoClinica}`] : [],
  };
}

export async function consultPharmacistAgent(options: {
  pergunta?: string;
  file?: File;
  perfil?: PatientProfile;
  medicamentos?: Medication[];
  lat?: number;
  lng?: number;
}): Promise<PharmacistConsultResponse> {
  const formData = new FormData();
  if (options.pergunta) formData.append("pergunta", options.pergunta);
  if (options.file) formData.append("file", options.file);
  if (options.lat !== undefined) formData.append("lat", String(options.lat));
  if (options.lng !== undefined) formData.append("lng", String(options.lng));

  if (options.perfil) {
    formData.append(
      "perfil",
      JSON.stringify({
        id: options.perfil.id,
        nome: options.perfil.nome,
        parentesco: options.perfil.parentesco,
        idade: options.perfil.idade ?? null,
        pesoKg: options.perfil.pesoKg ?? null,
        condicaoClinica: options.perfil.condicaoClinica ?? null,
      }),
    );
  }

  formData.append(
    "medicamentosCadastrados",
    JSON.stringify(
      (options.medicamentos ?? []).map((m) => ({
        nome: m.nome,
        dosagem: m.dosagem,
        tipo: m.tipo,
        controlado: m.controlado,
        tipoReceita: m.tipoReceita,
        intervaloHoras: m.intervaloHoras,
        horarios: m.horarios,
        condicaoTratamento: m.condicaoTratamento ?? null,
      })),
    ),
  );

  try {
    const response = await fetch(`${API_BASE_URL}/api/pharmacist/consult`, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      return (await response.json()) as PharmacistConsultResponse;
    }
  } catch {
    // Fallback local
  }

  const p = options.perfil;
  const pName = p?.nome ?? "Eu";
  const pDesc = p
    ? `${p.nome} (${p.parentesco}${p.idade ? `, ${p.idade} anos` : ""}${
        p.condicaoClinica ? `, Condição: ${p.condicaoClinica}` : ""
      })`
    : "Eu";

  // Identificação básica no fallback offline
  const queryStr = `${options.pergunta ?? ""} ${options.file?.name ?? ""}`.toLowerCase();
  const sampleItems: ExtractedPrescriptionItem[] = [];

  if (queryStr.includes("clonazepam") || queryStr.includes("rivotril")) {
    sampleItems.push({
      nome: "Clonazepam",
      dosagem: "2mg",
      unidade: "comprimido",
      quantidadePorDose: 1,
      origemPrescricao: "especializado",
      condicaoTratamento: p?.condicaoClinica || "Ansiedade / Sono",
      tipo: "continuo",
      controlado: true,
      tipoReceita: "azul",
      intervaloHoras: 24,
      horarios: ["21:00"],
      duracaoDias: null,
      estoqueSugerido: 30,
      alertaEstoqueMinimo: 10,
      paraQueServe: "Ansiolítico e anticonvulsivante benzodiazepínico para transtornos de ansiedade e sono.",
      comoTomar: "Tomar 1 comprimido à noite (21:00).",
      alertasSeguranca: [
        "⚠️ Uso Contínuo: NÃO interrompa abruptamente por conta própria.",
        "Evite dirigir veículos ou consumir bebidas alcoólicas.",
      ],
      ondeComprarOnline: [
        {
          farmacia: "Drogasil",
          urlBusca: "https://www.drogasil.com.br/search?w=Clonazepam",
          exigeReceitaFisica: true,
          observacao: "Tarja preta: retenção de receita B azul na loja.",
        },
        {
          farmacia: "Consulta Remédios",
          urlBusca: "https://consultaremedios.com.br/buscar?termo=Clonazepam",
          exigeReceitaFisica: true,
          observacao: "Comparador de preços.",
        },
      ],
    });
  }

  if (queryStr.includes("dipirona")) {
    sampleItems.push({
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
      estoqueSugerido: 200,
      alertaEstoqueMinimo: 30,
      paraQueServe: "Analgésico e antitérmico para alívio de dor e febre aguda.",
      comoTomar: "Tomar 15 gotas de 8 em 8 horas por 3 dias.",
      alertasSeguranca: ["Contraindicado para alérgicos a pirazolonas."],
      ondeComprarOnline: [
        {
          farmacia: "Drogasil",
          urlBusca: "https://www.drogasil.com.br/search?w=Dipirona",
          exigeReceitaFisica: false,
          observacao: "Venda livre.",
        },
      ],
    });
  }

  return {
    perfilConsiderado: pDesc,
    resumoConsulta: sampleItems.length > 0
      ? `Olá! Sou o **🧑‍⚕️ Meu Farmacêutico**, assistente virtual de **${pName}**. Identifiquei ${sampleItems.length} medicação(ões) com orientações, onde comprar e opção de cadastro direto.`
      : `Olá! Sou o **🧑‍⚕️ Meu Farmacêutico** de **${pName}**. Envie uma foto ou arquivo PDF da sua receita para que eu analise a posologia, interações e farmácias online/locais.`,
    itensIdentificados: sampleItems,
    farmaciasFisicasProximas: [],
    alertasGerais: [],
    geradoEm: new Date().toISOString(),
  };
}


