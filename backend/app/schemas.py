from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class MedicationType(str, Enum):
    TEMPORARIO = "temporario"
    CONTINUO = "continuo"


class PrescriptionType(str, Enum):
    SIMPLES = "simples"
    BRANCA_2_VIAS = "branca_2_vias"
    AZUL = "azul"
    AMARELA = "amarela"


class PrescriptionOrigin(str, Enum):
    EMERGENCIA = "emergencia"
    ESPECIALIZADO = "especializado"


class MedicationUnit(str, Enum):
    COMPRIMIDO = "comprimido"
    CAPSULA = "capsula"
    ML = "ml"
    GOTAS = "gotas"


class KinshipType(str, Enum):
    PROPRIO = "proprio"
    FILHO = "filho"
    IDOSO = "idoso"
    DEPENDENTE = "dependente"


class AlertCategory(str, Enum):
    DOSE_HORARIO = "dose_horario"
    ESTOQUE_BAIXO = "estoque_baixo"
    RENOVACAO_RECEITA = "renovacao_receita"
    REAVALIACAO_TRIMESTRAL = "reavaliacao_trimestral"
    FIM_TRATAMENTO_EMERGENCIA = "fim_tratamento_emergencia"


class PatientProfileContext(BaseModel):
    id: int | None = None
    nome: str = "Eu"
    parentesco: KinshipType = KinshipType.PROPRIO
    idade: int | None = None
    pesoKg: float | None = None
    condicaoClinica: str | None = None


class MedicationBulaSummary(BaseModel):
    paraQueServe: str
    alertasPrincipais: list[str] = Field(default_factory=list)
    interacoes: list[str] = Field(default_factory=list)
    efeitosColaterais: list[str] = Field(default_factory=list)
    usoContinuoAviso: str | None = None
    avisoOrigemPrescricao: str | None = None
    contextoPerfilClinico: str | None = None
    contextoCondicaoTratamento: str | None = None
    tarja: str = "Sem tarja / Isento ou Sob Prescrição"


class MedicationCreate(BaseModel):
    profileId: int = 1
    perfilNome: str = "Eu"
    nome: str = Field(min_length=1, max_length=160)
    dosagem: str = Field(min_length=1, max_length=100)
    unidade: MedicationUnit = MedicationUnit.COMPRIMIDO
    quantidadePorDose: float = Field(default=1.0, gt=0)
    origemPrescricao: PrescriptionOrigin = PrescriptionOrigin.ESPECIALIZADO
    condicaoTratamento: str | None = None
    tipo: MedicationType
    controlado: bool
    tipoReceita: PrescriptionType
    intervaloHoras: int = Field(gt=0, le=24 * 30)
    horarios: list[str] = Field(default_factory=list)
    duracaoDias: int | None = Field(default=None, gt=0)
    estoqueAtual: float = Field(ge=0)
    estoqueTotal: float = Field(ge=0)
    alertaEstoqueMinimo: float = Field(ge=0)
    dataInicio: date
    ativo: bool = True
    resumoBula: MedicationBulaSummary | None = None


class MedicationResponse(MedicationCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class ChatMedicationContext(BaseModel):
    nome: str
    dosagem: str
    tipo: MedicationType
    controlado: bool
    tipoReceita: PrescriptionType
    intervaloHoras: int
    horarios: list[str] = Field(default_factory=list)
    condicaoTratamento: str | None = None


class ChatRequest(BaseModel):
    pergunta: str = Field(min_length=1, max_length=10_000)
    perfil: PatientProfileContext | None = None
    medicamentos: list[ChatMedicationContext] = Field(default_factory=list)


class ChatResponse(BaseModel):
    resposta: str
    perfilConsiderado: str
    alertasSeguranca: list[str] = Field(default_factory=list)
    geradoEm: datetime


class RecipeScanResponse(BaseModel):
    nome: str | None = None
    dosagem: str | None = None
    posologia: str | None = None
    tipoReceita: PrescriptionType | None = None
    dataEmissao: date | None = None
    dataValidade: date | None = None
    confianca: float | None = Field(default=None, ge=0, le=1)
    observacoes: list[str] = Field(default_factory=list)


class BoxScanResponse(BaseModel):
    nome: str
    dosagem: str
    unidade: MedicationUnit = MedicationUnit.COMPRIMIDO
    quantidadePorDoseSugerida: float = 1.0
    quantidadeComprimidos: int = Field(gt=0)
    controlado: bool
    tipoReceita: PrescriptionType
    origemSugerida: PrescriptionOrigin = PrescriptionOrigin.ESPECIALIZADO
    condicaoSugerida: str | None = None
    tipoSugerido: MedicationType
    intervaloHorasSugerido: int = 12
    horariosSugeridos: list[str] = Field(default_factory=lambda: ["08:00", "20:00"])
    alertaEstoqueMinimoSugerido: int = 10
    confianca: float = Field(default=0.96, ge=0, le=1)
    resumoBula: MedicationBulaSummary


class MedicationMiniReportRequest(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    dosagem: str = Field(default="1 cp", max_length=100)
    unidade: MedicationUnit = MedicationUnit.COMPRIMIDO
    quantidadePorDose: float = 1.0
    origemPrescricao: PrescriptionOrigin = PrescriptionOrigin.ESPECIALIZADO
    condicaoTratamento: str | None = None
    tipo: MedicationType = MedicationType.TEMPORARIO
    controlado: bool = False
    tipoReceita: PrescriptionType = PrescriptionType.SIMPLES
    dataInicio: date | None = None
    duracaoDias: int | None = None
    outrosMedicamentos: list[str] = Field(default_factory=list)
    perfil: PatientProfileContext | None = None


class MedicationMiniReportResponse(BaseModel):
    nome: str
    dosagem: str
    unidade: MedicationUnit = MedicationUnit.COMPRIMIDO
    quantidadePorDose: float = 1.0
    origemPrescricao: PrescriptionOrigin = PrescriptionOrigin.ESPECIALIZADO
    condicaoTratamento: str | None = None
    tipo: MedicationType
    controlado: bool
    tipoReceita: PrescriptionType
    perfilNome: str = "Eu"
    resumoBula: MedicationBulaSummary
    interacoesDetectadasComBancoLocal: list[str] = Field(default_factory=list)
    marcoReavaliacao90Dias: date | None = None
    alertaReavaliacaoTrimestral: str | None = None
    geradoEm: datetime


class NearbyPharmacy(BaseModel):
    id: str
    nome: str
    endereco: str
    lat: float
    lng: float
    distanciaMetros: int
    distanciaFormatada: str
    telefone: str | None = None
    horarioFuncionamento: str | None = None
    googleMapsUrl: str
    appleMapsUrl: str


class NearbyPharmaciesResponse(BaseModel):
    latOrigem: float
    lngOrigem: float
    raioMetros: int
    localReferencia: str | None = None
    fonte: str
    farmacias: list[NearbyPharmacy]


class AutomatedAlertItem(BaseModel):
    id: str
    profileId: int = 1
    perfilNome: str = "Eu"
    categoria: AlertCategory
    severidade: str
    medicamentoNome: str
    medicamentoDosagem: str
    titulo: str
    mensagem: str
    dataReferencia: str
    diasDeUso: int | None = None
    requerGpsFarmacias: bool = False
    canaisEnvio: list[str] = Field(
        default_factory=lambda: ["in_app", "web_push", "webhook", "ics"]
    )


class EvaluateAlertsRequest(BaseModel):
    dataReferencia: date | None = None
    medicamentos: list[MedicationCreate] = Field(default_factory=list)
    webhookUrl: str | None = None


class EvaluateAlertsResponse(BaseModel):
    processadoEm: datetime
    totalAlertas: int
    jobsAgendados: int
    alertas: list[AutomatedAlertItem]


class PushWebhookSubscriptionRequest(BaseModel):
    endpoint: str
    canal: str = "web_push"
    chaves: dict[str, str] = Field(default_factory=dict)


class SchedulerStatusResponse(BaseModel):
    ativo: bool
    jobsAtivos: int
    inscricoesPushWebhook: int
    filaAlertas: list[AutomatedAlertItem]
    proximoDisparo: str | None = None


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    timestamp: datetime
