import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlarmClock,
  AlertTriangle,
  BellRing,
  Camera,
  Check,
  CloudOff,
  FileText,
  MapPin,
  MessageSquareHeart,
  PackagePlus,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
} from "lucide-react";
import {
  HighReadabilityKpiBar,
  formatBoxEquivalence,
} from "./components/HighReadabilityKpiBar";
import { MiniReportModal } from "./components/MiniReportModal";
import { PharmacyMiniMap } from "./components/PharmacyMiniMap";
import { ProfileSelectorBar, getKinshipEmoji } from "./components/ProfileSelectorBar";
import { RealTimeClock } from "./components/RealTimeClock";
import { ScheduleConfirmationModal } from "./components/ScheduleConfirmationModal";
import { UnifiedCalendar } from "./components/UnifiedCalendar";
import {
  MEDICATION_COLOR_PALETTE,
  database,
  deleteProfileCascade,
  ensureDefaultProfiles,
  getDefaultMedicationColor,
  getMedicationAcronym,
} from "./db/database";
import { insertSampleMedications } from "./db/seed";
import {
  TRIMESTRAL_ALERT_TEXT,
  askBulaAssistant,
  calculateIntervalSchedule,
  downloadLocalIcsCalendar,
  fetchMedicationMiniReport,
  fetchNearbyPharmacies,
  fetchPharmaciesByLocationQuery,
  formatDoseLabel,
  formatIntervalSummary,
  requestUserGeolocation,
  scanMedicationBox,
  syncBackendAlerts,
} from "./services/api";
import type {
  AutomatedAlertItem,
  ChatHistoryEntry,
  Medication,
  MedicationMiniReport,
  MedicationType,
  MedicationUnit,
  NearbyPharmaciesResponse,
  PatientProfile,
  PrescriptionOrigin,
  PrescriptionType,
} from "./types/medication";

function todayIsoString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysSinceDate(startIso: string, refIso?: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${refIso ?? todayIsoString()}T12:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

const TREATMENT_SUGGESTIONS = [
  "Alzheimer",
  "Convulsões / Epilepsia",
  "Ansiedade / Sono",
  "Dor / Febre",
  "Infecção",
  "Hipertensão",
  "Outro...",
];

function App() {
  // Estado Multi-Perfil
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | "all">("all");

  // Medicamentos e Rede
  const [allMedications, setAllMedications] = useState<Medication[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [message, setMessage] = useState("");
  const [isSeeding, setIsSeeding] = useState(false);

  // Navegação responsiva para mobile
  const [mobileTab, setMobileTab] = useState<"all" | "dashboard" | "calendar">("all");
  const [selectedDate, setSelectedDate] = useState<string>(todayIsoString);

  // Painel de Novo Medicamento e Scanner de Caixa
  const [showNewMedPanel, setShowNewMedPanel] = useState(false);
  const [isScanningBox, setIsScanningBox] = useState(false);
  const [restockingMedId, setRestockingMedId] = useState<number | null>(null);
  const newBoxInputRef = useRef<HTMLInputElement | null>(null);
  const restockFileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeRestockTarget, setActiveRestockTarget] = useState<Medication | null>(null);

  // Campos do formulário de Novo Medicamento (com Regras Clínicas + Cor de Identificação)
  const [formProfileId, setFormProfileId] = useState<number>(1);
  const [formOrigemPrescricao, setFormOrigemPrescricao] =
    useState<PrescriptionOrigin>("emergencia");
  const [formCondicaoTratamento, setFormCondicaoTratamento] = useState<string>("Dor / Febre");
  const [formNome, setFormNome] = useState("");
  const [formDosagem, setFormDosagem] = useState("");
  const [formCorIdentificacao, setFormCorIdentificacao] = useState<string>("#2563eb");
  const [formUnidade, setFormUnidade] = useState<MedicationUnit>("comprimido");
  const [formQuantidadePorDose, setFormQuantidadePorDose] = useState<number>(1);
  const [formTipo, setFormTipo] = useState<MedicationType>("temporario");
  const [formControlado, setFormControlado] = useState(false);
  const [formTipoReceita, setFormTipoReceita] = useState<PrescriptionType>("simples");
  const [formIntervaloHoras, setFormIntervaloHoras] = useState(8);
  const [formHoraInicial, setFormHoraInicial] = useState("08:00");
  const [formDuracaoDias, setFormDuracaoDias] = useState<number>(3);
  const [formEstoqueAtual, setFormEstoqueAtual] = useState(30);
  const [formAlertaMinimo, setFormAlertaMinimo] = useState(10);
  const [formDataInicio, setFormDataInicio] = useState(todayIsoString);

  // Modal Obrigatório de Confirmação de Horários antes de Salvar ou Atualizar
  const [scheduleDraft, setScheduleDraft] = useState<Medication | null>(null);
  const [isEditingExistingSchedule, setIsEditingExistingSchedule] = useState(false);

  // Pop-up automático de Mini-Relatório Inteligente
  const [activeMiniReport, setActiveMiniReport] = useState<MedicationMiniReport | null>(null);

  // Chat Assistente de Bula por Perfil
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [isAskingChat, setIsAskingChat] = useState(false);

  // Geolocalização (GPS) e Mini-Mapa Leaflet de Farmácias Próximas
  const [gpsStatus, setGpsStatus] = useState<
    "idle" | "requesting" | "granted" | "fallback" | "error"
  >("idle");
  const [gpsMessage, setGpsMessage] = useState("");
  const [pharmaciesData, setPharmaciesData] = useState<NearbyPharmaciesResponse | null>(null);
  const [isLoadingPharmacies, setIsLoadingPharmacies] = useState(false);
  const pharmacyMapSectionRef = useRef<HTMLDivElement | null>(null);

  // Motor consolidado de alertas
  const [alertsQueue, setAlertsQueue] = useState<AutomatedAlertItem[]>([]);
  const [schedulerJobsCount, setSchedulerJobsCount] = useState(0);
  const [backendConnected, setBackendConnected] = useState(false);

  const loadAllData = useCallback(async () => {
    const ensuredProfiles = await ensureDefaultProfiles();
    setProfiles(ensuredProfiles);

    const list = await database.medications.orderBy("nome").toArray();
    setAllMedications(list);

    const alertResult = await syncBackendAlerts(list, ensuredProfiles, selectedDate);
    setAlertsQueue(alertResult.alertas);
    setSchedulerJobsCount(alertResult.jobsAgendados);
    setBackendConnected(alertResult.backendAtivo);

    const history = await database.chat_history.orderBy("timestamp").reverse().limit(12).toArray();
    setChatHistory(history.reverse());
  }, [selectedDate]);

  useEffect(() => {
    void loadAllData();
    const updateNetworkStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    return () => {
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
    };
  }, [loadAllData]);

  useEffect(() => {
    if (selectedProfileId !== "all") {
      setFormProfileId(selectedProfileId);
      const prof = profiles.find((p) => p.id === selectedProfileId);
      if (prof?.condicaoClinica) {
        setFormCondicaoTratamento(prof.condicaoClinica);
      }
    } else if (profiles.length > 0 && profiles[0].id) {
      setFormProfileId((prev) => prev || profiles[0].id!);
    }
  }, [selectedProfileId, profiles]);

  const profileMap = useMemo(() => {
    const m = new Map<number, PatientProfile>();
    profiles.forEach((p) => {
      if (p.id !== undefined) m.set(p.id, p);
    });
    return m;
  }, [profiles]);

  const activeProfileObject = useMemo<PatientProfile | undefined>(() => {
    if (selectedProfileId !== "all") {
      return profileMap.get(selectedProfileId);
    }
    return profileMap.get(formProfileId) ?? profiles[0];
  }, [selectedProfileId, profileMap, formProfileId, profiles]);

  const visibleMedications = useMemo(() => {
    if (selectedProfileId === "all") return allMedications;
    return allMedications.filter((m) => m.profileId === selectedProfileId);
  }, [allMedications, selectedProfileId]);

  const visibleAlerts = useMemo(() => {
    if (selectedProfileId === "all") return alertsQueue;
    return alertsQueue.filter((a) => a.profileId === selectedProfileId);
  }, [alertsQueue, selectedProfileId]);

  const chronologicalFamilySchedule = useMemo(() => {
    const items: {
      horario: string;
      med: Medication;
      profile: PatientProfile | undefined;
    }[] = [];
    visibleMedications
      .filter((m) => m.ativo)
      .forEach((med) => {
        const prof = profileMap.get(med.profileId);
        med.horarios.forEach((horario) => {
          items.push({ horario, med, profile: prof });
        });
      });
    items.sort((a, b) => a.horario.localeCompare(b.horario));
    return items;
  }, [visibleMedications, profileMap]);

  const lowStockMedications = useMemo(
    () => visibleMedications.filter((m) => m.ativo && m.estoqueAtual <= m.alertaEstoqueMinimo),
    [visibleMedications],
  );

  const continuous90DayMedications = useMemo(
    () =>
      visibleMedications.filter(
        (m) =>
          m.ativo &&
          (m.tipo === "continuo" || m.origemPrescricao === "especializado") &&
          daysSinceDate(m.dataInicio, selectedDate) >= 90,
      ),
    [visibleMedications, selectedDate],
  );

  useEffect(() => {
    if (!pharmaciesData) {
      void fetchNearbyPharmacies(-23.561414, -46.655881, 3000).then(setPharmaciesData);
    }
  }, [pharmaciesData]);

  // Gerenciamento Completo de Perfis: Criar, Editar e Excluir em Cascata
  async function handleCreateProfile(newProfileData: Omit<PatientProfile, "id">) {
    const newId = await database.profiles.add(newProfileData);
    await loadAllData();
    setSelectedProfileId(newId);
    setMessage(
      `👤 Perfil "${newProfileData.nome}" (${newProfileData.parentesco}${
        newProfileData.condicaoClinica ? ` • ${newProfileData.condicaoClinica}` : ""
      }) criado e selecionado!`,
    );
  }

  async function handleUpdateProfile(updatedProfile: PatientProfile) {
    if (!updatedProfile.id) return;
    await database.profiles.update(updatedProfile.id, {
      nome: updatedProfile.nome,
      parentesco: updatedProfile.parentesco,
      idade: updatedProfile.idade,
      pesoKg: updatedProfile.pesoKg,
      condicaoClinica: updatedProfile.condicaoClinica,
      corAvatar: updatedProfile.corAvatar,
    });
    await loadAllData();
    setMessage(`✏️ Perfil "${updatedProfile.nome}" atualizado com sucesso!`);
  }

  async function handleDeleteProfile(profileId: number) {
    const targetName = profileMap.get(profileId)?.nome ?? "Perfil";
    const { deletedMeds, remainingProfiles } = await deleteProfileCascade(profileId);
    await loadAllData();
    if (selectedProfileId === profileId) {
      setSelectedProfileId(remainingProfiles[0]?.id ?? "all");
    }
    setMessage(
      `🗑️ Perfil "${targetName}" excluído em cascata junto com ${deletedMeds} medicação(ões) e históricos vinculados.`,
    );
  }

  async function handleInsertSamples() {
    setIsSeeding(true);
    setMessage("");
    try {
      const targetId = selectedProfileId === "all" ? undefined : selectedProfileId;
      const insertedCount = await insertSampleMedications(targetId);
      await loadAllData();
      setMessage(
        insertedCount > 0
          ? `✅ ${insertedCount} medicações de exemplo (GAR • Gardenal, ESC • Escitalopram e DIP • Dipirona) carregadas com siglas e cores distintas!`
          : "As 3 medicações de exemplo (GAR, ESC e DIP) já estão ativas no calendário.",
      );
    } catch (error) {
      console.error("Erro ao inserir medicamentos de teste:", error);
    } finally {
      setIsSeeding(false);
    }
  }

  function handleSelectPrescriptionOrigin(origin: PrescriptionOrigin) {
    setFormOrigemPrescricao(origin);
    if (origin === "emergencia") {
      setFormTipo("temporario");
      setFormDuracaoDias((prev) => (prev && prev > 0 ? prev : 3));
      setFormIntervaloHoras(8);
    } else {
      setFormTipo("continuo");
      setFormControlado(true);
      if (formTipoReceita === "simples") {
        setFormTipoReceita("azul");
      }
      if (activeProfileObject?.condicaoClinica) {
        setFormCondicaoTratamento(activeProfileObject.condicaoClinica);
      }
    }
  }

  function fillEmergencyPresetDipironaGotas() {
    handleSelectPrescriptionOrigin("emergencia");
    setFormNome("Dipirona");
    setFormDosagem("500mg/ml");
    setFormCorIdentificacao("#059669");
    setFormUnidade("gotas");
    setFormQuantidadePorDose(15);
    setFormIntervaloHoras(8);
    setFormHoraInicial("08:00");
    setFormDuracaoDias(3);
    setFormEstoqueAtual(200);
    setFormAlertaMinimo(45);
    setFormControlado(false);
    setFormTipoReceita("simples");
    setFormCondicaoTratamento("Dor / Febre");
  }

  function fillSpecializedPresetClonazepamAlzheimer() {
    const mae = profiles.find(
      (p) =>
        p.nome.toLowerCase().includes("mãe") ||
        p.nome.toLowerCase().includes("mae") ||
        p.parentesco === "idoso",
    );
    if (mae?.id) {
      setFormProfileId(mae.id);
    }
    setFormOrigemPrescricao("especializado");
    setFormTipo("continuo");
    setFormNome("Clonazepam");
    setFormDosagem("2mg");
    setFormCorIdentificacao("#e11d48");
    setFormUnidade("comprimido");
    setFormQuantidadePorDose(1);
    setFormIntervaloHoras(24);
    setFormHoraInicial("21:00");
    setFormEstoqueAtual(30);
    setFormAlertaMinimo(10);
    setFormControlado(true);
    setFormTipoReceita("azul");
    setFormCondicaoTratamento("Alzheimer");
  }

  function handlePrepareNewMedicationSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!formNome.trim() || !formDosagem.trim()) return;

    const effectiveTipo: MedicationType =
      formOrigemPrescricao === "especializado" ? "continuo" : formTipo;
    const calculatedSlots = calculateIntervalSchedule(formHoraInicial, formIntervaloHoras);

    const draft: Medication = {
      profileId: formProfileId || (profiles[0]?.id ?? 1),
      nome: formNome.trim(),
      dosagem: formDosagem.trim(),
      corIdentificacao:
        formCorIdentificacao ||
        getDefaultMedicationColor(formNome.trim(), allMedications.length),
      unidade: formUnidade,
      quantidadePorDose: Number(formQuantidadePorDose) || 1,
      origemPrescricao: formOrigemPrescricao,
      condicaoTratamento: formCondicaoTratamento.trim() || undefined,
      tipo: effectiveTipo,
      controlado: formControlado || formOrigemPrescricao === "especializado",
      tipoReceita: formTipoReceita,
      intervaloHoras: Number(formIntervaloHoras) || 8,
      horarios: calculatedSlots,
      duracaoDias:
        effectiveTipo === "temporario" ? Math.max(1, Number(formDuracaoDias) || 3) : undefined,
      estoqueAtual: Number(formEstoqueAtual) || 0,
      estoqueTotal: Number(formEstoqueAtual) || 0,
      alertaEstoqueMinimo: Number(formAlertaMinimo) || 5,
      dataInicio: formDataInicio || todayIsoString(),
      ativo: true,
    };

    setIsEditingExistingSchedule(false);
    setScheduleDraft(draft);
  }

  async function handleConfirmScheduleAndSave(confirmedMed: Medication) {
    const targetProfile =
      profileMap.get(confirmedMed.profileId) ?? activeProfileObject ?? profiles[0];

    const profileMeds = allMedications.filter((m) => m.profileId === confirmedMed.profileId);
    const outrosNomes = profileMeds
      .map((m) => m.nome)
      .filter((n) => n.toLowerCase() !== confirmedMed.nome.toLowerCase());

    if (isEditingExistingSchedule && confirmedMed.id) {
      await database.medications.update(confirmedMed.id, {
        intervaloHoras: confirmedMed.intervaloHoras,
        horarios: confirmedMed.horarios,
        duracaoDias: confirmedMed.duracaoDias,
      });
      await loadAllData();
      setScheduleDraft(null);
      setMessage(
        `✅ Horários de "${confirmedMed.nome}" ([${
          targetProfile?.nome ?? "Eu"
        }]) confirmados (${confirmedMed.horarios.join(" • ")}) e calendário atualizado!`,
      );
      return;
    }

    const report = await fetchMedicationMiniReport({
      nome: confirmedMed.nome,
      dosagem: confirmedMed.dosagem,
      unidade: confirmedMed.unidade,
      quantidadePorDose: confirmedMed.quantidadePorDose,
      origemPrescricao: confirmedMed.origemPrescricao,
      condicaoTratamento: confirmedMed.condicaoTratamento,
      tipo: confirmedMed.tipo,
      controlado: confirmedMed.controlado,
      tipoReceita: confirmedMed.tipoReceita,
      dataInicio: confirmedMed.dataInicio,
      duracaoDias: confirmedMed.duracaoDias,
      outrosMedicamentos: outrosNomes,
      perfil: targetProfile,
    });

    const recordToSave: Medication = {
      ...confirmedMed,
      corIdentificacao:
        confirmedMed.corIdentificacao ||
        getDefaultMedicationColor(confirmedMed.nome, allMedications.length),
      resumoBula: report.resumoBula,
    };

    await database.medications.add(recordToSave);
    await loadAllData();

    setScheduleDraft(null);
    setShowNewMedPanel(false);
    setActiveMiniReport(report);
    setMessage(
      `✅ [${targetProfile?.nome ?? "Eu"}] "${confirmedMed.nome} ${
        confirmedMed.dosagem
      }" salvo com sigla [${getMedicationAcronym(confirmedMed.nome)}] e horários confirmados!`,
    );
  }

  async function handleScanBoxForNewMedication(options: { file?: File; hint?: string }) {
    setIsScanningBox(true);
    setShowNewMedPanel(true);
    const targetProfile =
      profileMap.get(formProfileId) ?? activeProfileObject ?? profiles[0];
    setMessage(
      `📷 Lendo foto da caixa com a IA multimodal para o perfil [${targetProfile?.nome ?? "Eu"}]...`,
    );

    try {
      const outrosNomes = allMedications
        .filter((m) => m.profileId === (targetProfile?.id ?? 1))
        .map((m) => m.nome);

      const scanned = await scanMedicationBox({
        file: options.file,
        hint: options.hint,
        outrosMedicamentos: outrosNomes,
        perfil: targetProfile,
      });

      const condTratamento =
        targetProfile?.condicaoClinica || scanned.condicaoSugerida || "Acompanhamento Clínico";
      const assignedColor = getDefaultMedicationColor(scanned.nome, allMedications.length);

      setFormNome(scanned.nome);
      setFormDosagem(scanned.dosagem);
      setFormCorIdentificacao(assignedColor);
      setFormUnidade(scanned.unidade);
      setFormQuantidadePorDose(scanned.quantidadePorDoseSugerida);
      setFormOrigemPrescricao(scanned.origemSugerida);
      setFormCondicaoTratamento(condTratamento);
      setFormTipo(scanned.tipoSugerido);
      setFormControlado(scanned.controlado);
      setFormTipoReceita(scanned.tipoReceita);
      setFormIntervaloHoras(scanned.intervaloHorasSugerido);
      setFormHoraInicial(scanned.horariosSugeridos[0] ?? "08:00");
      setFormEstoqueAtual(scanned.quantidadeComprimidos);
      setFormAlertaMinimo(scanned.alertaEstoqueMinimoSugerido);
      setFormDuracaoDias(scanned.tipoSugerido === "temporario" ? 3 : 30);

      const report = await fetchMedicationMiniReport({
        nome: scanned.nome,
        dosagem: scanned.dosagem,
        unidade: scanned.unidade,
        quantidadePorDose: scanned.quantidadePorDoseSugerida,
        origemPrescricao: scanned.origemSugerida,
        condicaoTratamento: condTratamento,
        tipo: scanned.tipoSugerido,
        controlado: scanned.controlado,
        tipoReceita: scanned.tipoReceita,
        dataInicio: todayIsoString(),
        duracaoDias: scanned.tipoSugerido === "temporario" ? 3 : undefined,
        outrosMedicamentos: outrosNomes,
        perfil: targetProfile,
      });

      await database.medications.add({
        profileId: targetProfile?.id ?? 1,
        nome: scanned.nome,
        dosagem: scanned.dosagem,
        corIdentificacao: assignedColor,
        unidade: scanned.unidade,
        quantidadePorDose: scanned.quantidadePorDoseSugerida,
        origemPrescricao: scanned.origemSugerida,
        condicaoTratamento: condTratamento,
        tipo: scanned.tipoSugerido,
        controlado: scanned.controlado,
        tipoReceita: scanned.tipoReceita,
        intervaloHoras: scanned.intervaloHorasSugerido,
        horarios: scanned.horariosSugeridos,
        duracaoDias: scanned.tipoSugerido === "temporario" ? 3 : undefined,
        estoqueAtual: scanned.quantidadeComprimidos,
        estoqueTotal: scanned.quantidadeComprimidos,
        alertaEstoqueMinimo: scanned.alertaEstoqueMinimoSugerido,
        dataInicio: todayIsoString(),
        ativo: true,
        resumoBula: report.resumoBula,
      });

      await loadAllData();
      setActiveMiniReport(report);
      setMessage(
        `✅ [${targetProfile?.nome ?? "Eu"}] "${scanned.nome} ${
          scanned.dosagem
        }" cadastrado via Foto da Caixa (${scanned.quantidadeComprimidos} ${
          scanned.unidade
        })!`,
      );
    } catch (error) {
      console.error("Erro ao escanear caixa:", error);
      setMessage("Não foi possível processar a imagem da caixa.");
    } finally {
      setIsScanningBox(false);
    }
  }

  async function handleScanBoxForRestock(med: Medication, file?: File) {
    if (!med.id) return;
    setRestockingMedId(med.id);
    const prof = profileMap.get(med.profileId);
    setMessage(
      `📷 Fotografando caixa de ${med.nome} ([${prof?.nome ?? "Eu"}]) para reposição automática...`,
    );
    try {
      const scanned = await scanMedicationBox({
        file,
        hint: `${med.nome} ${med.dosagem}`,
        outrosMedicamentos: allMedications
          .filter((m) => m.profileId === med.profileId)
          .map((m) => m.nome),
        perfil: prof,
      });

      const addedQty = scanned.quantidadeComprimidos;
      const newStock = med.estoqueAtual + addedQty;

      await database.medications.update(med.id, {
        estoqueAtual: newStock,
        ultimaReposicaoEm: new Date().toISOString(),
      });

      await loadAllData();
      setMessage(
        `📦 [${prof?.nome ?? "Eu"}] Caixa de ${med.nome} reconhecida! +${addedQty} ${
          med.unidade
        } somados automaticamente. Estoque atual: ${newStock} ${med.unidade}.`,
      );
    } catch (error) {
      console.error("Erro ao repor estoque por foto:", error);
      setMessage("Falha ao ler a foto da caixa para reposição.");
    } finally {
      setRestockingMedId(null);
      setActiveRestockTarget(null);
    }
  }

  async function handleTakeDose(med: Medication) {
    if (!med.id || med.estoqueAtual <= 0) return;
    const stepDose = med.quantidadePorDose || 1;
    const updatedStock = Math.max(0, Number((med.estoqueAtual - stepDose).toFixed(2)));
    const nowIso = new Date().toISOString();
    const prof = profileMap.get(med.profileId);

    await database.transaction("rw", database.medications, database.dose_logs, async () => {
      await database.medications.update(med.id!, { estoqueAtual: updatedStock });
      await database.dose_logs.add({
        profileId: med.profileId,
        medicationId: med.id!,
        dataHoraPrevista: nowIso,
        dataHoraTomada: nowIso,
        status: "tomado",
      });
    });

    await loadAllData();
    setMessage(
      `💊 [${prof?.nome ?? "Eu"}] Dose de ${med.nome} (${formatDoseLabel(
        stepDose,
        med.unidade,
      )}) marcada como TOMADA às ${new Date().toLocaleTimeString("pt-BR")}. Estoque e KPIs atualizados!`,
    );

    if (updatedStock <= med.alertaEstoqueMinimo) {
      void handleLocateNearbyPharmacies();
    }
  }

  async function handleSimulateLowStock(med: Medication) {
    if (!med.id) return;
    const lowValue = Math.max(2, Math.min(5, med.alertaEstoqueMinimo));
    await database.medications.update(med.id, { estoqueAtual: lowValue });
    await loadAllData();
    setMessage(
      `⚠️ Estoque de ${med.nome} ajustado para ${lowValue} ${med.unidade} (Alerta de Estoque Baixo ativado). Confira o Mini-Mapa Leaflet de Farmácias Próximas!`,
    );
    pharmacyMapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSimulate90DaysContinuous(med: Medication) {
    if (!med.id) return;
    const d = new Date();
    d.setDate(d.getDate() - 90);
    const iso90Ago = d.toISOString().slice(0, 10);
    await database.medications.update(med.id, {
      tipo: "continuo",
      origemPrescricao: "especializado",
      dataInicio: iso90Ago,
    });
    await loadAllData();
    setSelectedDate(todayIsoString());
    setMessage(
      `🩺 Simulação de 90 dias (3 meses) ativada para ${med.nome}. Alerta médico trimestral disparado!`,
    );
  }

  async function handleOpenMedicationReport(med: Medication) {
    const prof = profileMap.get(med.profileId);
    const outrosNomes = allMedications
      .filter((m) => m.profileId === med.profileId)
      .map((m) => m.nome)
      .filter((n) => n.toLowerCase() !== med.nome.toLowerCase());

    const report = await fetchMedicationMiniReport({
      nome: med.nome,
      dosagem: med.dosagem,
      unidade: med.unidade,
      quantidadePorDose: med.quantidadePorDose,
      origemPrescricao: med.origemPrescricao,
      condicaoTratamento: med.condicaoTratamento,
      tipo: med.tipo,
      controlado: med.controlado,
      tipoReceita: med.tipoReceita,
      dataInicio: med.dataInicio,
      duracaoDias: med.duracaoDias,
      outrosMedicamentos: outrosNomes,
      perfil: prof,
    });
    setActiveMiniReport(report);
  }

  async function handleDeleteMedication(med: Medication) {
    if (!med.id) return;
    await database.medications.delete(med.id);
    await loadAllData();
    setMessage(`Medicamento "${med.nome}" removido.`);
  }

  async function handleLocateNearbyPharmacies() {
    setIsLoadingPharmacies(true);
    setGpsStatus("requesting");
    setGpsMessage("Solicitando permissão de localização (GPS) ao navegador...");

    try {
      const coords = await requestUserGeolocation();
      setGpsStatus("granted");
      setGpsMessage(
        `GPS autorizado (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(
          4,
        )}) — Consultando farmácias e drogarias num raio de 3 km...`,
      );
      const result = await fetchNearbyPharmacies(coords.lat, coords.lng, 3000);
      setPharmaciesData(result);
      setGpsMessage(
        `Encontradas ${result.farmacias.length} farmácias próximas via ${result.fonte}.`,
      );
    } catch {
      const fallbackCoords = { lat: -23.561414, lng: -46.655881 };
      const result = await fetchNearbyPharmacies(fallbackCoords.lat, fallbackCoords.lng, 3000);
      setPharmaciesData(result);
      setGpsStatus("fallback");
      setGpsMessage(
        "Permissão de GPS negada ou sensor indisponível — exibindo farmácias na localização de referência. Você também pode buscar por bairro/cidade acima.",
      );
    } finally {
      setIsLoadingPharmacies(false);
    }
  }

  async function handleSearchPharmaciesByQuery(query: string) {
    setIsLoadingPharmacies(true);
    setGpsStatus("fallback");
    setGpsMessage(`Buscando farmácias próximas a "${query}"...`);
    try {
      const result = await fetchPharmaciesByLocationQuery(query, 3000);
      setPharmaciesData(result);
      setGpsMessage(
        `Localização "${result.localReferencia ?? query}" carregada — ${
          result.farmacias.length
        } farmácias encontradas no Mini-Mapa.`,
      );
    } finally {
      setIsLoadingPharmacies(false);
    }
  }

  async function handleAskBulaChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatQuestion.trim()) return;
    const q = chatQuestion.trim();
    setChatQuestion("");
    setIsAskingChat(true);

    const prof = activeProfileObject;
    const profId = prof?.id ?? 1;
    const userEntry: ChatHistoryEntry = {
      profileId: profId,
      role: "user",
      content: `[${prof?.nome ?? "Eu"}] ${q}`,
      timestamp: new Date().toISOString(),
    };
    await database.chat_history.add(userEntry);

    try {
      const profMeds = allMedications.filter((m) => m.profileId === profId);
      const ans = await askBulaAssistant({
        pergunta: q,
        perfil: prof,
        medications: profMeds,
      });
      const assistantEntry: ChatHistoryEntry = {
        profileId: profId,
        role: "assistant",
        content: ans.resposta,
        timestamp: new Date().toISOString(),
      };
      await database.chat_history.add(assistantEntry);
      await loadAllData();
    } finally {
      setIsAskingChat(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      {/* Input oculto para reposição rápida de estoque via foto da caixa */}
      <input
        ref={restockFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (activeRestockTarget) {
            void handleScanBoxForRestock(activeRestockTarget, file);
          }
          e.target.value = "";
        }}
      />

      {/* Cabeçalho Global "Meu Cuidado Diário" + Relógio em Tempo Real + Seletor Multi-Perfil (com Editar ✏️ e Excluir 🗑️) */}
      <header className="sticky top-0 z-30 border-b border-emerald-950/10 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <a
            className="flex items-center gap-3"
            href="/"
            aria-label="Meu Cuidado Diário, início"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-forest text-white shadow-sm">
              <Pill size={22} strokeWidth={2.2} />
            </span>
            <div>
              <span
                className="block text-lg font-extrabold tracking-tight text-ink sm:text-xl"
                data-testid="app-brand-title"
              >
                Meu Cuidado Diário
              </span>
              <span className="block text-xs text-muted">
                Gestão Multi-Perfil Familiar, Alta Legibilidade, Assistente IA e Mini-Mapa
              </span>
            </div>
          </a>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <RealTimeClock />

            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                isOffline ? "bg-amber-50 text-amber-800" : "bg-mint text-forest"
              }`}
              role="status"
            >
              {isOffline ? <CloudOff size={14} /> : <ShieldCheck size={14} />}
              <span className="hidden sm:inline">
                {isOffline ? "Modo offline" : "Multi-Perfil Ativo"}
              </span>
            </div>
          </div>
        </div>

        {/* Barra Fixa de Seleção e Gerenciamento de Perfis (Editar ✏️ e Excluir 🗑️ em Cascata) */}
        <ProfileSelectorBar
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          onSelectProfile={setSelectedProfileId}
          onCreateProfile={handleCreateProfile}
          onUpdateProfile={handleUpdateProfile}
          onDeleteProfile={handleDeleteProfile}
        />

        {/* Barra de alternância rápida exclusiva para Mobile */}
        <div className="flex border-t border-slate-100 bg-slate-50/80 px-4 py-1.5 lg:hidden">
          <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMobileTab("all")}
              className={`rounded-lg py-1.5 transition ${
                mobileTab === "all" ? "bg-white text-forest shadow-2xs" : "text-slate-600"
              }`}
            >
              Tudo Integrado
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("dashboard")}
              className={`rounded-lg py-1.5 transition ${
                mobileTab === "dashboard" ? "bg-white text-forest shadow-2xs" : "text-slate-600"
              }`}
            >
              Doses & Estoque
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("calendar")}
              className={`rounded-lg py-1.5 transition ${
                mobileTab === "calendar" ? "bg-white text-forest shadow-2xs" : "text-slate-600"
              }`}
            >
              Calendário ({visibleAlerts.length})
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
        {/* PAINEL DE RESUMO RÁPIDO DE ALTA LEGIBILIDADE (KPI CARDS) */}
        <HighReadabilityKpiBar
          medications={visibleMedications}
          referenceDate={selectedDate}
        />

        {/* Banner de Ações Rápidas */}
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-card sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-forest">
              {selectedProfileId === "all"
                ? "👨‍👩‍👧 Visão Consolidada de Toda a Família"
                : `${getKinshipEmoji(activeProfileObject?.parentesco ?? "proprio")} Perfil Ativo: ${
                    activeProfileObject?.nome ?? "Eu"
                  }${
                    activeProfileObject?.condicaoClinica
                      ? ` (${activeProfileObject.condicaoClinica})`
                      : ""
                  }`}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Dashboard de Alta Legibilidade & Calendário por Siglas
            </h1>
            <p className="mt-1 text-sm text-muted">
              Siglas de 3 letras com cores exclusivas no calendário, leitura facilitada de estoque e
              confirmação interativa de horários.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewMedPanel((prev) => !prev)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-forest px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-900 sm:text-sm"
              data-testid="open-new-med-btn"
            >
              <Plus size={17} />
              Novo Medicamento
            </button>

            <button
              type="button"
              onClick={() => {
                setShowNewMedPanel(true);
                newBoxInputRef.current?.click();
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-forest bg-mint/70 px-3.5 py-2 text-xs font-bold text-forest transition hover:bg-mint sm:text-sm"
              data-testid="header-scan-box-btn"
            >
              <Camera size={17} />
              📷 Fotografar Caixa
            </button>

            <button
              type="button"
              onClick={() => {
                pharmacyMapSectionRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
                void handleLocateNearbyPharmacies();
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/20 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-forest transition hover:bg-mint"
              data-testid="header-nearby-pharmacies-btn"
            >
              <MapPin size={16} />
              📍 Farmácias Próximas
            </button>

            <button
              type="button"
              onClick={() => setShowChatPanel((prev) => !prev)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs font-bold text-violet-900 transition hover:bg-violet-100"
              data-testid="toggle-bula-chat-btn"
            >
              <MessageSquareHeart size={16} />
              Chat de Bula IA
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              title="Imprimir / Salvar Relatório Médico em PDF prefixado por perfil"
            >
              <Printer size={15} />
              PDF
            </button>

            <button
              type="button"
              onClick={() => void handleInsertSamples()}
              disabled={isSeeding}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-violet-300 bg-violet-50 px-3.5 py-2 text-xs font-bold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
              data-testid="seed-trio-btn"
            >
              {isSeeding ? <RefreshCw className="animate-spin" size={14} /> : <Activity size={14} />}
              Carregar Trio (GAR + ESC + DIP)
            </button>
          </div>
        </section>

        {/* Mensagem de Feedback / Toast */}
        {message && (
          <div
            className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-950 shadow-2xs"
            role="status"
            data-testid="status-toast"
          >
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="text-xs font-bold text-emerald-800 underline"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Painel de Chat Assistente de Bula com Contexto do Perfil Ativo */}
        {showChatPanel && (
          <section
            className="mb-6 rounded-3xl border-2 border-violet-300 bg-white p-5 shadow-card"
            data-testid="bula-chat-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-700 text-white">
                  <MessageSquareHeart size={20} />
                </span>
                <div>
                  <h2 className="text-base font-bold text-ink">
                    Assistente de Bula IA — Contexto do Perfil [{activeProfileObject?.nome ?? "Eu"}]
                  </h2>
                  <p className="text-xs text-muted">
                    Envia automaticamente idade ({activeProfileObject?.idade ?? "N/I"}a), peso (
                    {activeProfileObject?.pesoKg ?? "N/I"}kg), parentesco (
                    {activeProfileObject?.parentesco ?? "proprio"}) e condição clínica (
                    {activeProfileObject?.condicaoClinica || "Nenhuma informada"}).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChatPanel(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Fechar Chat
              </button>
            </div>

            {chatHistory.length > 0 && (
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3 text-xs">
                {chatHistory.map((entry, idx) => (
                  <div
                    key={entry.id ?? idx}
                    className={`rounded-xl p-2.5 ${
                      entry.role === "user"
                        ? "ml-auto max-w-xl bg-forest text-white"
                        : "mr-auto max-w-2xl border border-violet-200 bg-white text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-line">{entry.content}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={(e) => void handleAskBulaChat(e)} className="mt-3 flex gap-2">
              <input
                type="text"
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                placeholder={`Pergunte sobre interações, doses ou cuidados para ${
                  activeProfileObject?.nome ?? "este perfil"
                }...`}
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-xs sm:text-sm"
              />
              <button
                type="submit"
                disabled={isAskingChat}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                <Send size={14} />
                Perguntar
              </button>
            </form>
          </section>
        )}

        {/* Visão Consolidada "Todos": Linha do Tempo Cronológica da Família para o Cuidador */}
        {selectedProfileId === "all" && chronologicalFamilySchedule.length > 0 && (
          <section
            className="mb-6 rounded-3xl border border-emerald-950/10 bg-white p-4 shadow-card sm:p-5"
            data-testid="family-chronological-schedule"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-forest">
                  👨‍👩‍👧 Próximos Horários da Família em Ordem Cronológica (Visão do Cuidador)
                </h2>
                <p className="text-xs text-muted">
                  Todos os medicamentos ativos agrupados por horário com suas siglas de 3 letras.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
              {chronologicalFamilySchedule.map(({ horario, med, profile }, idx) => (
                <div
                  key={`${med.id}-${horario}-${idx}`}
                  className="flex min-w-56 shrink-0 items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-canvas px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-white"
                        style={{
                          backgroundColor:
                            med.corIdentificacao || getDefaultMedicationColor(med.nome, idx),
                        }}
                      >
                        {getMedicationAcronym(med.nome)}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: profile?.corAvatar ?? "#246b59" }}
                      >
                        [{profile?.nome ?? "Eu"}]
                      </span>
                      <span className="font-mono text-sm font-extrabold text-forest">{horario}</span>
                    </div>
                    <p className="mt-1 font-bold text-ink">
                      {med.nome} <span className="font-normal text-muted">({med.dosagem})</span>
                    </p>
                    <p className="text-[11px] text-muted">
                      {formatDoseLabel(med.quantidadePorDose || 1, med.unidade || "comprimido")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Alerta Preventivo Especial de 3 Meses (90 dias de uso contínuo) */}
        {continuous90DayMedications.length > 0 && (
          <section
            className="mb-6 rounded-3xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-sm sm:p-5"
            data-testid="trimestral-90d-alert-card"
          >
            {continuous90DayMedications.map((med) => {
              const prof = profileMap.get(med.profileId);
              return (
                <div
                  key={med.id ?? med.nome}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white">
                      <Stethoscope size={22} />
                    </span>
                    <div>
                      <span className="inline-block rounded-full bg-amber-200/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-950">
                        [{prof?.nome ?? "Eu"}] Marco de 90 Dias Atingido — {med.nome} ({med.dosagem})
                      </span>
                      <p className="mt-1 text-sm font-bold sm:text-base">{TRIMESTRAL_ALERT_TEXT}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Painel de Cadastro de Novo Medicamento com Regras Clínicas + Cor Exclusiva + Scanner Multimodal */}
        {showNewMedPanel && (
          <section
            className="mb-8 rounded-3xl border-2 border-forest/20 bg-white p-5 shadow-card sm:p-7"
            aria-labelledby="new-med-heading"
            data-testid="new-medication-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 id="new-med-heading" className="text-xl font-bold text-ink">
                  Cadastrar Medicamento (Sigla & Cor Exclusiva + Confirmação de Horários)
                </h2>
                <p className="text-xs text-muted">
                  Informe a origem da prescrição, escolha a cor de identificação para o calendário e
                  revise os horários.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewMedPanel(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-900/15 bg-mint/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-white">
                    <Camera size={20} />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      Scanner Multimodal de Caixa & Atalhos Clínicos
                    </h3>
                    <p className="text-xs text-muted">
                      Tire uma foto da caixa ou preencha rapidamente um cenário clínico.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={newBoxInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    data-testid="new-med-box-file-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void handleScanBoxForNewMedication({ file });
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={isScanningBox}
                    onClick={() => newBoxInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-forest px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-900"
                    data-testid="modal-scan-box-upload-btn"
                  >
                    <Camera size={14} />
                    📷 Fotografar Caixa
                  </button>

                  <button
                    type="button"
                    onClick={fillEmergencyPresetDipironaGotas}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900 transition hover:bg-rose-100"
                    data-testid="preset-emergency-dipirona-btn"
                  >
                    🚑 Preencher Emergência: Dipirona 15 gotas (8/8h • 3d)
                  </button>

                  <button
                    type="button"
                    onClick={fillSpecializedPresetClonazepamAlzheimer}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900 transition hover:bg-indigo-100"
                    data-testid="preset-specialized-clonazepam-btn"
                  >
                    🩺 Preencher Especializado: Clonazepam 2mg (Alzheimer)
                  </button>

                  <button
                    type="button"
                    disabled={isScanningBox}
                    onClick={() =>
                      void handleScanBoxForNewMedication({
                        hint: "Clonazepam 2mg 30 comprimidos",
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900 transition hover:bg-violet-100"
                    data-testid="quick-scan-clonazepam-btn"
                  >
                    <Sparkles size={13} />
                    Foto Caixa: Clonazepam 2mg
                  </button>

                  <button
                    type="button"
                    disabled={isScanningBox}
                    onClick={() =>
                      void handleScanBoxForNewMedication({
                        hint: "Buscopan 10mg 20 comprimidos",
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 transition hover:bg-sky-100"
                    data-testid="quick-scan-buscopan-btn"
                  >
                    <Sparkles size={13} />
                    Foto Caixa: Buscopan 10mg
                  </button>
                </div>
              </div>
            </div>

            <form
              onSubmit={handlePrepareNewMedicationSchedule}
              className="mt-5 space-y-5"
            >
              {/* PERGUNTA OBRIGATÓRIA 1: Origem da Prescrição */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-forest">
                  1. Este medicamento foi prescrito em: *
                </label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleSelectPrescriptionOrigin("emergencia")}
                    className={`flex items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition ${
                      formOrigemPrescricao === "emergencia"
                        ? "border-rose-500 bg-rose-50/70 ring-2 ring-rose-200"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                    data-testid="origin-emergency-btn"
                  >
                    <span className="text-2xl">🚑</span>
                    <div>
                      <p className="text-sm font-bold text-ink">
                        Atendimento de Emergência / Pronto-Socorro
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Uso agudo/pontual (dor, febre, infecção). Foca em contagem regressiva de dias
                        e lembrete de retorno se sintomas persistirem.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPrescriptionOrigin("especializado")}
                    className={`flex items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition ${
                      formOrigemPrescricao === "especializado"
                        ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-200"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                    data-testid="origin-specialized-btn"
                  >
                    <span className="text-2xl">🩺</span>
                    <div>
                      <p className="text-sm font-bold text-ink">
                        Tratamento Especializado / Acompanhamento Contínuo
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Neurologia, Psiquiatria, Cardiologia (ex: Clonazepam, Gardenal, Escitalopram).
                        Ativa controle rigoroso, alerta de não interrupção e marco de 90 dias.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* CAMPO 2: Condição / Tratamento Opcional + Seleção de Perfil */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    Paciente / Perfil Familiar *
                  </label>
                  <select
                    value={formProfileId}
                    onChange={(e) => setFormProfileId(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                    data-testid="select-med-profile"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {getKinshipEmoji(p.parentesco)} {p.nome}
                        {p.idade ? ` (${p.idade} anos)` : ""}
                        {p.condicaoClinica ? ` — ${p.condicaoClinica}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    Para qual tratamento este remédio foi indicado? (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formCondicaoTratamento}
                    onChange={(e) => setFormCondicaoTratamento(e.target.value)}
                    placeholder="Ex: Alzheimer, Convulsões / Epilepsia, Dor / Febre..."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="input-med-condicao-tratamento"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {TREATMENT_SUGGESTIONS.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() =>
                          setFormCondicaoTratamento(sug === "Outro..." ? "" : sug)
                        }
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
                          formCondicaoTratamento === sug
                            ? "bg-forest text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-mint"
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* CAMPO 3: Dados do Medicamento, Cor Exclusiva no Calendário e Posologia */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nome do Medicamento *{" "}
                    {formNome && (
                      <span
                        className="ml-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: formCorIdentificacao }}
                      >
                        Sigla: {getMedicationAcronym(formNome)}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={formNome}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormNome(val);
                      setFormCorIdentificacao(
                        getDefaultMedicationColor(val, allMedications.length),
                      );
                    }}
                    placeholder="Ex: Dipirona, Escitalopram..."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="input-med-nome"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Concentração / Dosagem *
                  </label>
                  <input
                    type="text"
                    required
                    value={formDosagem}
                    onChange={(e) => setFormDosagem(e.target.value)}
                    placeholder="Ex: 500mg/ml, 10mg, 2mg"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="input-med-dosagem"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Unidade Farmacêutica
                  </label>
                  <select
                    value={formUnidade}
                    onChange={(e) => setFormUnidade(e.target.value as MedicationUnit)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="select-med-unidade"
                  >
                    <option value="comprimido">Comprimido(s)</option>
                    <option value="capsula">Cápsula(s)</option>
                    <option value="gotas">Gotas (Frasco)</option>
                    <option value="ml">Mililitros — ml (Frasco)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Quantidade por Dose ({formUnidade})
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step="0.5"
                    required
                    value={formQuantidadePorDose}
                    onChange={(e) => setFormQuantidadePorDose(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="input-med-qtd-dose"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Tomar de X em X horas
                  </label>
                  <select
                    value={formIntervaloHoras}
                    onChange={(e) => setFormIntervaloHoras(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                    data-testid="select-med-intervalo"
                  >
                    <option value={4}>De 4 em 4 horas (6x/dia)</option>
                    <option value={6}>De 6 em 6 horas (4x/dia)</option>
                    <option value={8}>De 8 em 8 horas (3x/dia)</option>
                    <option value={12}>De 12 em 12 horas (2x/dia)</option>
                    <option value={24}>De 24 em 24 horas (1x/dia)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Hora da 1ª Dose
                  </label>
                  <input
                    type="time"
                    value={formHoraInicial}
                    onChange={(e) => setFormHoraInicial(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>

                {formOrigemPrescricao === "emergencia" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Durante quantos dias?
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={formDuracaoDias}
                      onChange={(e) => setFormDuracaoDias(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                      data-testid="input-med-duracao-dias"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Estoque Total na Caixa/Frasco ({formUnidade})
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formEstoqueAtual}
                    onChange={(e) => setFormEstoqueAtual(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="input-med-estoque"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Cor Exclusiva da Sigla no Calendário
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {MEDICATION_COLOR_PALETTE.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setFormCorIdentificacao(c.hex)}
                        title={c.label}
                        className={`h-6 w-6 rounded-full border-2 transition ${
                          formCorIdentificacao === c.hex
                            ? "scale-115 border-slate-900"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-forest">
                  📋 Resumo:{" "}
                  {formatIntervalSummary(
                    formIntervaloHoras,
                    formOrigemPrescricao === "especializado" ? "continuo" : formTipo,
                    formOrigemPrescricao === "emergencia" ? formDuracaoDias : undefined,
                  )}
                </p>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-900"
                  data-testid="submit-new-med-btn"
                >
                  <AlarmClock size={17} />
                  Revisar e Confirmar Horários →
                </button>
              </div>
            </form>
          </section>
        )}

        {/* GRADE DIVIDIDA (SPLIT-VIEW NO DESKTOP lg:grid-cols-12) */}
        <div
          className="grid gap-8 lg:grid-cols-12 lg:items-start"
          data-testid="responsive-split-layout"
        >
          {/* COLUNA ESQUERDA (7 cols no Desktop): Cards de Medicações com Leitura Facilitada + Mini-Mapa */}
          <div
            className={`space-y-6 lg:col-span-7 ${
              mobileTab === "calendar" ? "hidden lg:block" : "block"
            }`}
          >
            {/* Lista de Medicamentos (Leitura Facilitada e Alta Legibilidade) */}
            <section aria-labelledby="medications-heading">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="medications-heading" className="text-xl font-bold tracking-tight">
                    Lista de Medicações — Leitura Facilitada ({visibleMedications.length})
                  </h2>
                  <p className="text-xs text-muted">
                    Alto contraste, barra de progresso semafórica (Verde/Amarelo/Vermelho) e
                    atualização instantânea dos KPIs.
                  </p>
                </div>
              </div>

              {visibleMedications.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-emerald-900/20 bg-white px-6 py-12 text-center shadow-card">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint text-forest">
                    <Pill size={25} />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">
                    Nenhum medicamento cadastrado neste perfil
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                    Clique em <strong>“Carregar Trio (GAR + ESC + DIP)”</strong> ou{" "}
                    <strong>“Novo Medicamento”</strong> acima para visualizar as siglas coloridas e
                    os KPIs.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {visibleMedications.map((medication, idx) => {
                    const prof = profileMap.get(medication.profileId);
                    const medColor =
                      medication.corIdentificacao ||
                      getDefaultMedicationColor(medication.nome, idx);
                    const acronym = getMedicationAcronym(medication.nome);
                    const isLowStock = medication.estoqueAtual <= medication.alertaEstoqueMinimo;
                    const daysUsed = daysSinceDate(medication.dataInicio, selectedDate);
                    const isContinuousOrSpecialized =
                      medication.tipo === "continuo" ||
                      medication.origemPrescricao === "especializado";
                    const reached90d = isContinuousOrSpecialized && daysUsed >= 90;

                    const baseCapacity = Math.max(
                      medication.estoqueAtual,
                      medication.estoqueTotal || 20,
                    );
                    const stockPercent = Math.min(
                      100,
                      Math.round((medication.estoqueAtual / Math.max(1, baseCapacity)) * 100),
                    );

                    // Cor Semafórica da Barra de Progresso (Verde / Amarelo / Vermelho)
                    const progressColorClass = isLowStock
                      ? "bg-rose-600"
                      : stockPercent <= 50
                        ? "bg-amber-500"
                        : "bg-emerald-600";

                    const doseLabel = formatDoseLabel(
                      medication.quantidadePorDose || 1,
                      medication.unidade || "comprimido",
                    );
                    const tomadasPorDia = Math.max(1, medication.horarios.length);
                    const diasAutonomia = Math.floor(
                      medication.estoqueAtual /
                        Math.max(0.1, tomadasPorDia * (medication.quantidadePorDose || 1)),
                    );
                    const diasRestantesTemp = Math.max(
                      0,
                      (medication.duracaoDias ?? 3) - daysUsed,
                    );

                    return (
                      <article
                        key={medication.id}
                        className={`rounded-3xl border-2 bg-white p-5 shadow-card transition sm:p-6 ${
                          isLowStock
                            ? "border-rose-300 ring-1 ring-rose-200"
                            : "border-emerald-950/10"
                        }`}
                        data-testid={`medication-card-${medication.nome.toLowerCase()}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3.5">
                            {/* Badge Grande de Sigla de 3 Letras com Cor Exclusiva */}
                            <span
                              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-mono text-base font-extrabold tracking-wider text-white shadow-sm"
                              style={{ backgroundColor: medColor }}
                              title={`Sigla no calendário: ${acronym}`}
                            >
                              {acronym}
                            </span>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="rounded-md px-2 py-0.5 text-xs font-extrabold text-white"
                                  style={{ backgroundColor: prof?.corAvatar ?? "#246b59" }}
                                >
                                  [{prof?.nome ?? "Eu"}]
                                </span>
                                {/* Nome + Dosagem em Fonte Grande e Legível */}
                                <h3 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                                  {medication.nome}{" "}
                                  <span className="text-forest">{medication.dosagem}</span>
                                </h3>
                              </div>

                              {/* Frequência em Destaque Legível */}
                              <p
                                className="mt-1.5 text-sm font-extrabold text-slate-800 sm:text-base"
                                data-testid={`med-interval-summary-${medication.nome.toLowerCase()}`}
                              >
                                ⏰{" "}
                                {formatIntervalSummary(
                                  medication.intervaloHoras,
                                  medication.tipo,
                                  medication.duracaoDias,
                                )}{" "}
                                <span className="font-mono text-forest">
                                  ({medication.horarios.join(" • ")})
                                </span>
                              </p>

                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                    medication.origemPrescricao === "emergencia"
                                      ? "bg-rose-100 text-rose-900"
                                      : "bg-indigo-100 text-indigo-900"
                                  }`}
                                >
                                  {medication.origemPrescricao === "emergencia"
                                    ? "🚑 Emergência / Temporário"
                                    : "🩺 Uso Contínuo / Especializado"}
                                </span>
                                {medication.condicaoTratamento && (
                                  <span
                                    className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-900"
                                    data-testid={`med-condition-badge-${medication.nome.toLowerCase()}`}
                                  >
                                    🎯 {medication.condicaoTratamento}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleOpenMedicationReport(medication)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-mint/50 px-3 py-1.5 text-xs font-bold text-forest transition hover:bg-mint"
                              data-testid={`open-report-btn-${medication.nome.toLowerCase()}`}
                            >
                              <FileText size={14} />
                              Mini-Relatório IA
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteMedication(medication)}
                              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              title="Remover medicamento"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Bloco de Alta Legibilidade: Estoque Atual + Equivalência em Caixas + Barra de Progresso Colorida */}
                        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-canvas p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                Estoque Disponível:
                              </span>
                              <p
                                className="text-base font-extrabold text-ink sm:text-lg"
                                data-testid={`med-stock-boxes-${medication.nome.toLowerCase()}`}
                              >
                                📦{" "}
                                {formatBoxEquivalence(
                                  medication.estoqueAtual,
                                  medication.estoqueTotal,
                                  medication.unidade,
                                )}
                              </p>
                            </div>

                            <div className="text-right">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                Tempo Restante / Autonomia:
                              </span>
                              <p className="text-sm font-extrabold text-forest sm:text-base">
                                {isContinuousOrSpecialized
                                  ? `⏳ Dura mais ${diasAutonomia} ${
                                      diasAutonomia === 1 ? "dia" : "dias"
                                    }`
                                  : `⏳ Faltam ${diasRestantesTemp} ${
                                      diasRestantesTemp === 1 ? "dia" : "dias"
                                    } para terminar`}
                              </p>
                            </div>
                          </div>

                          {/* Barra de Progresso Semafórica (Verde / Amarelo / Vermelho) */}
                          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full transition-all duration-300 ${progressColorClass}`}
                              style={{ width: `${stockPercent}%` }}
                            />
                          </div>
                        </div>

                        {reached90d && (
                          <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-950">
                            {TRIMESTRAL_ALERT_TEXT}
                          </div>
                        )}

                        {/* Botões de Ação do Card */}
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5">
                          <button
                            type="button"
                            onClick={() => void handleTakeDose(medication)}
                            disabled={medication.estoqueAtual <= 0}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-forest px-4 py-2 text-xs font-extrabold text-white shadow-2xs transition hover:bg-emerald-900 disabled:opacity-50 sm:text-sm"
                            data-testid={`take-dose-btn-${medication.nome.toLowerCase()}`}
                          >
                            <Check size={16} />
                            Tomar Dose ({doseLabel})
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingExistingSchedule(true);
                              setScheduleDraft(medication);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/20 bg-emerald-50 px-3 py-2 text-xs font-bold text-forest transition hover:bg-mint"
                            data-testid={`edit-schedule-btn-${medication.nome.toLowerCase()}`}
                          >
                            <AlarmClock size={14} />
                            ✏️ Editar Horários
                          </button>

                          <button
                            type="button"
                            disabled={restockingMedId === medication.id}
                            onClick={() => void handleScanBoxForRestock(medication)}
                            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-forest bg-mint/70 px-3 py-1.5 text-xs font-bold text-forest transition hover:bg-mint"
                            data-testid={`restock-scan-btn-${medication.nome.toLowerCase()}`}
                          >
                            <Camera size={14} />
                            + Repor Estoque (📷 Caixa)
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveRestockTarget(medication);
                              restockFileInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <PackagePlus size={13} />
                            Arquivo Foto
                          </button>

                          {!isLowStock && (
                            <button
                              type="button"
                              onClick={() => void handleSimulateLowStock(medication)}
                              className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                              data-testid={`simulate-low-stock-btn-${medication.nome.toLowerCase()}`}
                            >
                              <AlertTriangle size={12} />
                              Testar Estoque Baixo
                            </button>
                          )}

                          {isContinuousOrSpecialized && !reached90d && (
                            <button
                              type="button"
                              onClick={() => void handleSimulate90DaysContinuous(medication)}
                              className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                              data-testid={`simulate-90d-btn-${medication.nome.toLowerCase()}`}
                            >
                              <Stethoscope size={12} />
                              Simular 90 Dias
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Mini-Mapa Interativo de Farmácias e Drogarias Próximas */}
            <div ref={pharmacyMapSectionRef}>
              <PharmacyMiniMap
                pharmaciesData={pharmaciesData}
                isLoading={isLoadingPharmacies}
                gpsStatus={gpsStatus}
                gpsMessage={gpsMessage}
                lowStockSummary={
                  lowStockMedications.length > 0
                    ? lowStockMedications
                        .map(
                          (m) =>
                            `[${profileMap.get(m.profileId)?.nome ?? "Eu"}] ${m.nome}: ${
                              m.estoqueAtual
                            } ${m.unidade}`,
                        )
                        .join(", ")
                    : undefined
                }
                onRequestGps={() => void handleLocateNearbyPharmacies()}
                onSearchByQuery={(q) => void handleSearchPharmaciesByQuery(q)}
              />
            </div>
          </div>

          {/* COLUNA DIREITA (5 cols no Desktop): Calendário Unificado com Siglas de 3 Letras + Fila de Alertas */}
          <div
            className={`space-y-6 lg:col-span-5 ${
              mobileTab === "dashboard" ? "hidden lg:block" : "block"
            }`}
          >
            <UnifiedCalendar
              medications={visibleMedications}
              profiles={profiles}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onExportIcs={() =>
                downloadLocalIcsCalendar(
                  visibleMedications,
                  profiles,
                  selectedProfileId === "all" ? "familia" : activeProfileObject?.nome,
                )
              }
            />

            {/* Motor de Automação de Envios de Alerta Multi-Perfil */}
            <section
              className="rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-card sm:p-6"
              aria-labelledby="alert-automator-heading"
              data-testid="alert-automator-panel"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-forest text-white">
                    <BellRing size={19} />
                  </span>
                  <div>
                    <h2 id="alert-automator-heading" className="text-base font-bold text-ink">
                      Motor de Alertas ({visibleAlerts.length})
                    </h2>
                    <p className="text-xs text-muted">
                      {backendConnected
                        ? `APScheduler Python Ativo • ${schedulerJobsCount} jobs na fila`
                        : `Motor Local Ativo • ${visibleAlerts.length} alertas monitorados`}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-bold text-forest">
                  Push / Webhook / ICS
                </span>
              </div>

              {visibleAlerts.length === 0 ? (
                <p className="mt-4 text-xs text-muted">
                  Nenhum alerta pendente para o filtro de perfil selecionado.
                </p>
              ) : (
                <ul className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
                  {visibleAlerts.map((alerta) => (
                    <li
                      key={alerta.id}
                      className={`rounded-2xl border p-3 text-xs leading-5 ${
                        alerta.categoria === "reavaliacao_trimestral"
                          ? "border-amber-300 bg-amber-50/90 text-amber-950"
                          : alerta.categoria === "estoque_baixo"
                            ? "border-rose-200 bg-rose-50/70 text-rose-950"
                            : alerta.categoria === "fim_tratamento_emergencia"
                              ? "border-rose-300 bg-rose-50/80 text-rose-950"
                              : alerta.categoria === "renovacao_receita"
                                ? "border-violet-200 bg-violet-50/70 text-violet-950"
                                : "border-slate-100 bg-canvas text-ink"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span>{alerta.titulo}</span>
                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">
                          {alerta.categoria.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 opacity-90">{alerta.mensagem}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Modal Obrigatório de Confirmação Interativa de Horários antes de Salvar ou Atualizar */}
      <ScheduleConfirmationModal
        draft={scheduleDraft}
        profileName={
          scheduleDraft
            ? (profileMap.get(scheduleDraft.profileId)?.nome ?? "Eu")
            : (activeProfileObject?.nome ?? "Eu")
        }
        isEditingExisting={isEditingExistingSchedule}
        onConfirm={handleConfirmScheduleAndSave}
        onCancel={() => setScheduleDraft(null)}
      />

      {/* Pop-up / Modal Automático Pós-Cadastro: Mini-Relatório Inteligente da Medicação */}
      <MiniReportModal report={activeMiniReport} onClose={() => setActiveMiniReport(null)} />
    </main>
  );
}

export default App;
