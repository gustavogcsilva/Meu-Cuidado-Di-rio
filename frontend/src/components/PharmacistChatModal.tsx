import { useState, useRef, useEffect } from "react";
import {
  Camera,
  FileText,
  Send,
  X,
  ExternalLink,
  MapPin,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShoppingBag,
  Info,
} from "lucide-react";
import type {
  ExtractedPrescriptionItem,
  PatientProfile,
  PharmacistConsultResponse,
  OnlinePharmacyLink,
  NearbyPharmacy,
} from "../types/medication";
import { consultPharmacistAgent } from "../services/api";

interface PharmacistChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfile?: PatientProfile;
  onImportMedication: (item: ExtractedPrescriptionItem) => Promise<void>;
  onImportAllMedications?: (items: ExtractedPrescriptionItem[]) => Promise<void>;
}

interface MessageItem {
  id: string;
  sender: "user" | "pharmacist";
  text: string;
  filePreview?: { name: string; type: "image" | "pdf"; url?: string };
  data?: PharmacistConsultResponse;
  timestamp: string;
}

export function PharmacistChatModal({
  isOpen,
  onClose,
  activeProfile,
  onImportMedication,
  onImportAllMedications,
}: PharmacistChatModalProps) {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "welcome",
      sender: "pharmacist",
      text: `Olá! Sou seu Farmacêutico Virtual 🧑‍⚕️. Estou aqui para analisar suas receitas (em foto ou PDF), responder dúvidas sobre dosagem, efeitos colaterais e interações medicamentosas${
        activeProfile
          ? ` considerando o perfil de ${activeProfile.nome}${
              activeProfile.condicaoClinica ? ` (${activeProfile.condicaoClinica})` : ""
            }`
          : ""
      }. Como posso ajudar você hoje?`,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    },
  ]);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [importedItems, setImportedItems] = useState<Record<string, boolean>>({});
  const [importNotification, setImportNotification] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setSelectedPdf(null);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  }

  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPdf(file);
      setSelectedImage(null);
      setImagePreviewUrl(null);
    }
  }

  function clearAttachments() {
    setSelectedImage(null);
    setSelectedPdf(null);
    setImagePreviewUrl(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  async function handleSend() {
    if (!inputMessage.trim() && !selectedImage && !selectedPdf) return;

    const userText = inputMessage.trim();
    const userMsgId = `user-${Date.now()}`;
    const fileInfo = selectedImage
      ? { name: selectedImage.name, type: "image" as const, url: imagePreviewUrl ?? undefined }
      : selectedPdf
      ? { name: selectedPdf.name, type: "pdf" as const }
      : undefined;

    const newMessages: MessageItem[] = [
      ...messages,
      {
        id: userMsgId,
        sender: "user",
        text: userText || (selectedImage ? "📷 Envio de Foto de Receita" : "📄 Envio de PDF de Receita"),
        filePreview: fileInfo,
        timestamp: new Date().toLocaleTimeString().slice(0, 5),
      },
    ];

    setMessages(newMessages);
    setInputMessage("");
    const fileToSend = selectedImage || selectedPdf;
    clearAttachments();
    setIsLoading(true);

    try {
      const response = await consultPharmacistAgent({
        pergunta:
          userText ||
          (fileToSend?.type === "application/pdf"
            ? "Analise esta receita médica em PDF e identifique todas as medicações prescritas."
            : "Analise a foto desta receita médica e extraia todas as medicações."),
        file: fileToSend ?? undefined,
        perfil: activeProfile,
        medicamentos: [],
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `pharma-${Date.now()}`,
          sender: "pharmacist",
          text: response.resumoConsulta,
          data: response,
          timestamp: new Date().toLocaleTimeString().slice(0, 5),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `pharma-err-${Date.now()}`,
          sender: "pharmacist",
          text: `Desculpe, ocorreu um erro ao consultar o farmacêutico: ${
            err instanceof Error ? err.message : "Serviço temporariamente indisponível."
          }`,
          timestamp: new Date().toLocaleTimeString().slice(0, 5),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleImportSingle(item: ExtractedPrescriptionItem) {
    try {
      await onImportMedication(item);
      setImportedItems((prev) => ({ ...prev, [item.nome]: true }));
      setImportNotification(`Medicação "${item.nome}" cadastrada com sucesso no perfil!`);
      setTimeout(() => setImportNotification(null), 4000);
    } catch (err) {
      alert(`Erro ao cadastrar medicação: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleImportAll(items: ExtractedPrescriptionItem[]) {
    try {
      if (onImportAllMedications) {
        await onImportAllMedications(items);
      } else {
        for (const item of items) {
          await onImportMedication(item);
        }
      }
      const newImported: Record<string, boolean> = {};
      items.forEach((it) => {
        newImported[it.nome] = true;
      });
      setImportedItems((prev) => ({ ...prev, ...newImported }));
      setImportNotification(`${items.length} medicações cadastradas com sucesso no Meu Cuidado Diário!`);
      setTimeout(() => setImportNotification(null), 4000);
    } catch (err) {
      alert(`Erro ao cadastrar medicações: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      data-testid="pharmacist-chat-modal"
    >
      <div className="flex h-[92vh] max-h-[820px] w-full max-w-4xl flex-col rounded-3xl border border-emerald-900/15 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-900/10 bg-emerald-950 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-700/80 text-2xl shadow-inner">
              🧑‍⚕️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold sm:text-lg">Meu Farmacêutico</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                  <Sparkles size={11} /> IA Especialista
                </span>
              </div>
              <p className="text-xs text-emerald-200/90">
                Análise de Bula Oficial, Receitas em Foto/PDF e Onde Comprar
                {activeProfile ? ` • Contexto: ${activeProfile.nome}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-emerald-300 transition hover:bg-white/10 hover:text-white"
            title="Fechar (ESC)"
            data-testid="close-pharmacist-modal-btn"
          >
            <X size={20} />
          </button>
        </div>

        {/* Notificação Temporária de Importação */}
        {importNotification && (
          <div className="flex items-center gap-2 bg-emerald-100 border-b border-emerald-300 px-4 py-2.5 text-xs font-bold text-emerald-950">
            <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
            <span>{importNotification}</span>
          </div>
        )}

        {/* Mensagens & Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[92%] sm:max-w-[85%] rounded-3xl p-4 sm:p-5 shadow-sm ${
                  msg.sender === "user"
                    ? "bg-forest text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                }`}
              >
                {/* Nome do Remetente */}
                <div className="flex items-center justify-between gap-3 text-[11px] opacity-75 mb-1.5 font-semibold">
                  <span>{msg.sender === "user" ? "Você" : "🧑‍⚕️ Farmacêutico Virtual"}</span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Pré-visualização de Anexo */}
                {msg.filePreview && (
                  <div className="mb-3 rounded-2xl bg-black/10 p-2 text-xs">
                    {msg.filePreview.type === "image" && msg.filePreview.url ? (
                      <div className="space-y-1">
                        <img
                          src={msg.filePreview.url}
                          alt="Receita anexada"
                          className="max-h-48 rounded-xl object-contain"
                        />
                        <span className="text-[10px] opacity-80 block truncate">
                          📷 {msg.filePreview.name}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 font-medium">
                        <FileText size={18} />
                        <span className="truncate">{msg.filePreview.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Texto da Mensagem */}
                <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                  {msg.text}
                </div>

                {/* Conteúdo Estruturado do Farmacêutico */}
                {msg.data && msg.data.itensIdentificados && msg.data.itensIdentificados.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-4">
                    {/* Botão para importar todas */}
                    {msg.data.itensIdentificados.length > 1 && (
                      <div className="flex items-center justify-between bg-emerald-50 rounded-2xl p-3 border border-emerald-200">
                        <span className="text-xs font-bold text-emerald-950">
                          {msg.data.itensIdentificados.length} medicações identificadas na receita
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            msg.data?.itensIdentificados &&
                            handleImportAll(msg.data.itensIdentificados)
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-forest px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-900 transition"
                          data-testid="import-all-meds-btn"
                        >
                          <PlusCircle size={14} />
                          Cadastrar Todas no Meu Cuidado Diário
                        </button>
                      </div>
                    )}

                    {/* Cards de cada medicamento identificado */}
                    {msg.data.itensIdentificados.map((item: ExtractedPrescriptionItem, idx: number) => {
                      const isImported = importedItems[item.nome];
                      return (
                        <div
                          key={idx}
                          className="rounded-2xl border border-emerald-900/15 bg-white p-4 text-slate-800 shadow-sm space-y-3"
                        >
                          {/* Topo do Card */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-extrabold text-sm sm:text-base text-ink">
                                  💊 {item.nome} {item.dosagem}
                                </h4>
                                {item.controlado && (
                                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                    Controlado
                                  </span>
                                )}
                                {item.tipo === "continuo" && (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                    Uso Contínuo
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Posologia: 1 {item.unidade} a cada {item.intervaloHoras}h (
                                {item.horarios.join(", ")})
                              </p>
                            </div>

                            {/* Botão de Importação Individual */}
                            <button
                              type="button"
                              disabled={isImported}
                              onClick={() => handleImportSingle(item)}
                              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                isImported
                                  ? "bg-emerald-100 text-emerald-800 cursor-default"
                                  : "bg-forest text-white hover:bg-emerald-900 shadow-sm"
                              }`}
                              data-testid={`import-med-${item.nome.toLowerCase()}`}
                            >
                              {isImported ? (
                                <>
                                  <CheckCircle2 size={13} /> Cadastrado
                                </>
                              ) : (
                                <>
                                  <PlusCircle size={13} /> Cadastrar no App
                                </>
                              )}
                            </button>
                          </div>

                          {/* 1. Indicação Clínica (Para que serve) */}
                          <div className="rounded-xl bg-slate-50 p-2.5 text-xs">
                            <span className="font-bold text-slate-700 flex items-center gap-1">
                              <Info size={13} className="text-forest" /> Para que serve:
                            </span>
                            <p className="mt-1 text-slate-600 leading-relaxed">
                              {item.paraQueServe ||
                                item.condicaoTratamento ||
                                "Uso conforme indicação médica e bula oficial."}
                            </p>
                          </div>

                          {/* 2. Alertas & Cuidados de Uso */}
                          {item.alertasSeguranca && item.alertasSeguranca.length > 0 && (
                            <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-2.5 text-xs text-amber-950">
                              <span className="font-bold flex items-center gap-1 text-amber-900">
                                <AlertTriangle size={13} /> Alertas de Segurança & Interações:
                              </span>
                              <ul className="mt-1 list-disc list-inside space-y-1 text-amber-900/90">
                                {item.alertasSeguranca.map((alerta, aIdx) => (
                                  <li key={aIdx}>{alerta}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* 3. Onde Comprar (Farmácias Online + Físicas) */}
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                              <ShoppingBag size={14} className="text-forest" />
                              <span>Onde Comprar Online:</span>
                            </div>

                            {/* Links Farmácias Online */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {item.ondeComprarOnline.map((pharma: OnlinePharmacyLink, pIdx: number) => (
                                <a
                                  key={pIdx}
                                  href={pharma.urlBusca}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-2 text-xs transition hover:border-forest hover:bg-mint/30"
                                >
                                  <div className="flex items-center justify-between font-bold text-slate-800">
                                    <span>{pharma.farmacia}</span>
                                    <ExternalLink size={12} className="text-slate-400" />
                                  </div>
                                  {pharma.exigeReceitaFisica && (
                                    <span className="mt-1 text-[10px] text-rose-600 font-semibold leading-tight">
                                      ⚠️ Retenção de receita
                                    </span>
                                  )}
                                </a>
                              ))}
                            </div>

                            {/* Alerta de Retenção de Receita se controlado */}
                            {item.controlado && (
                              <p className="text-[11px] text-rose-700 font-medium bg-rose-50 border border-rose-200 rounded-lg p-2">
                                ⚠️ <strong>Medicamento de Controle Especial:</strong> A compra
                                online exige a apresentação e retenção da receita física (branca
                                ou azul) no ato da entrega ou retirada no balcão.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Farmácias Físicas Próximas */}
                    {msg.data.farmaciasFisicasProximas && msg.data.farmaciasFisicasProximas.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <MapPin size={14} className="text-forest" />
                          <span>Drogarias Físicas Próximas para Compra Imediata:</span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2 text-xs">
                          {msg.data.farmaciasFisicasProximas.slice(0, 4).map((farma: NearbyPharmacy, fIdx: number) => (
                            <div
                              key={fIdx}
                              className="flex items-center justify-between rounded-xl bg-white border border-slate-200 p-2"
                            >
                              <div className="truncate pr-2">
                                <strong className="text-slate-800 block truncate">
                                  {farma.nome}
                                </strong>
                                <span className="text-[11px] text-slate-500">
                                  {farma.distanciaFormatada || farma.endereco || "Região próxima"}
                                </span>
                              </div>
                              <a
                                href={farma.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  farma.nome + " " + (farma.endereco || "")
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-forest hover:bg-mint"
                              >
                                Rota <ExternalLink size={10} />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Estado de Carregamento */}
          {isLoading && (
            <div className="flex items-start">
              <div className="rounded-3xl rounded-bl-sm border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-forest">
                  <span className="inline-block h-3 w-3 animate-ping rounded-full bg-forest" />
                  <span>Analisando bula oficial, prescrição e interações clínicas...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Barra de Anexos Pendentes */}
        {(selectedImage || selectedPdf) && (
          <div className="flex items-center justify-between bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 border-t border-amber-200">
            <div className="flex items-center gap-2 truncate">
              {selectedImage ? <Camera size={14} /> : <FileText size={14} />}
              <span className="truncate">
                Anexo pronto: {selectedImage?.name || selectedPdf?.name}
              </span>
            </div>
            <button
              type="button"
              onClick={clearAttachments}
              className="text-amber-800 hover:text-amber-950 font-bold ml-2"
            >
              Remover
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2"
          >
            {/* Input Oculto de Foto */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
              data-testid="pharmacist-image-input"
            />
            {/* Input Oculto de PDF */}
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfSelect}
              data-testid="pharmacist-pdf-input"
            />

            {/* Botão Foto de Receita */}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-forest transition"
              title="Fotografar ou enviar imagem da receita"
              data-testid="pharmacist-photo-btn"
            >
              <Camera size={18} />
            </button>

            {/* Botão PDF de Receita */}
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-forest transition"
              title="Anexar arquivo PDF de receita médica"
              data-testid="pharmacist-pdf-btn"
            >
              <FileText size={18} />
            </button>

            {/* Campo de Texto */}
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Pergunte ao Farmacêutico ou envie sua receita..."
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-xs sm:text-sm focus:border-forest focus:outline-none"
              disabled={isLoading}
              data-testid="pharmacist-text-input"
            />

            {/* Botão Enviar */}
            <button
              type="submit"
              disabled={isLoading || (!inputMessage.trim() && !selectedImage && !selectedPdf)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-forest text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="pharmacist-send-btn"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
