export type MedicationType = "temporario" | "continuo";
export type PrescriptionType = "simples" | "branca_2_vias" | "azul" | "amarela";
export type PrescriptionOrigin = "emergencia" | "especializado";
export type MedicationUnit = "comprimido" | "capsula" | "ml" | "gotas";
export type KinshipType = "proprio" | "filho" | "idoso" | "dependente";
export type DoseStatus = "pendente" | "tomado" | "pulado";
export type ChatRole = "user" | "assistant";
export type AlertCategory =
  | "dose_horario"
  | "estoque_baixo"
  | "renovacao_receita"
  | "reavaliacao_trimestral"
  | "fim_tratamento_emergencia";

export interface PatientProfile {
  id?: number;
  nome: string;
  parentesco: KinshipType;
  idade?: number;
  pesoKg?: number;
  condicaoClinica?: string;
  corAvatar: string;
}

export interface MedicationBulaSummary {
  paraQueServe: string;
  alertasPrincipais: string[];
  interacoes: string[];
  efeitosColaterais: string[];
  usoContinuoAviso?: string | null;
  avisoOrigemPrescricao?: string | null;
  contextoPerfilClinico?: string | null;
  contextoCondicaoTratamento?: string | null;
  tarja: string;
}

export interface Medication {
  id?: number;
  profileId: number;
  nome: string;
  dosagem: string;
  corIdentificacao?: string;
  unidade: MedicationUnit;
  quantidadePorDose: number;
  origemPrescricao: PrescriptionOrigin;
  condicaoTratamento?: string;
  tipo: MedicationType;
  controlado: boolean;
  tipoReceita: PrescriptionType;
  intervaloHoras: number;
  horarios: string[];
  duracaoDias?: number;
  estoqueAtual: number;
  estoqueTotal: number;
  alertaEstoqueMinimo: number;
  dataInicio: string;
  ativo: boolean;
  resumoBula?: MedicationBulaSummary;
  ultimaReposicaoEm?: string;
}

export interface DoseLog {
  id?: number;
  profileId: number;
  medicationId: number;
  dataHoraPrevista: string;
  dataHoraTomada?: string;
  status: DoseStatus;
}

export interface ChatHistoryEntry {
  id?: number;
  profileId: number;
  role: ChatRole;
  content: string;
  timestamp: string;
}

export interface BoxScanResult {
  nome: string;
  dosagem: string;
  unidade: MedicationUnit;
  quantidadePorDoseSugerida: number;
  quantidadeComprimidos: number;
  controlado: boolean;
  tipoReceita: PrescriptionType;
  origemSugerida: PrescriptionOrigin;
  condicaoSugerida?: string | null;
  tipoSugerido: MedicationType;
  intervaloHorasSugerido: number;
  horariosSugeridos: string[];
  alertaEstoqueMinimoSugerido: number;
  confianca: number;
  resumoBula: MedicationBulaSummary;
}

export interface MedicationMiniReport {
  nome: string;
  dosagem: string;
  unidade: MedicationUnit;
  quantidadePorDose: number;
  origemPrescricao: PrescriptionOrigin;
  condicaoTratamento?: string | null;
  tipo: MedicationType;
  controlado: boolean;
  tipoReceita: PrescriptionType;
  perfilNome: string;
  resumoBula: MedicationBulaSummary;
  interacoesDetectadasComBancoLocal: string[];
  marcoReavaliacao90Dias?: string | null;
  alertaReavaliacaoTrimestral?: string | null;
  geradoEm: string;
}

export interface NearbyPharmacy {
  id: string;
  nome: string;
  endereco: string;
  lat: number;
  lng: number;
  distanciaMetros: number;
  distanciaFormatada: string;
  telefone?: string | null;
  horarioFuncionamento?: string | null;
  googleMapsUrl: string;
  appleMapsUrl: string;
}

export interface NearbyPharmaciesResponse {
  latOrigem: number;
  lngOrigem: number;
  raioMetros: number;
  localReferencia?: string | null;
  fonte: string;
  farmacias: NearbyPharmacy[];
}

export interface AutomatedAlertItem {
  id: string;
  profileId: number;
  perfilNome: string;
  categoria: AlertCategory;
  severidade: "info" | "warning" | "critical" | string;
  medicamentoNome: string;
  medicamentoDosagem: string;
  titulo: string;
  mensagem: string;
  dataReferencia: string;
  diasDeUso?: number | null;
  requerGpsFarmacias: boolean;
  canaisEnvio: string[];
}
