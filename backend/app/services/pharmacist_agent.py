from __future__ import annotations

import io
import json
import logging
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Any

from pypdf import PdfReader

from app.schemas import (
    ChatMedicationContext,
    ExtractedPrescriptionItem,
    KinshipType,
    MedicationType,
    MedicationUnit,
    NearbyPharmacy,
    OnlinePharmacyLink,
    PatientProfileContext,
    PharmacistConsultResponse,
    PrescriptionOrigin,
    PrescriptionType,
)
from app.services.assistant_service import (
    MEDICATION_KNOWLEDGE_BASE,
    _match_medication_profile,
    _normalize,
)
from app.services.pharmacy_service import find_nearby_pharmacies

logger = logging.getLogger("meu_cuidado_diario.pharmacist_agent")


def build_online_pharmacy_links(nome: str, controlado: bool) -> list[OnlinePharmacyLink]:
    encoded = urllib.parse.quote_plus(nome)
    obs = (
        "Medicamento sob controle especial: compra online exige retenção da receita física no balcão da farmácia."
        if controlado
        else "Venda online disponível para entrega ou retirada."
    )
    return [
        OnlinePharmacyLink(
            farmacia="Drogasil",
            urlBusca=f"https://www.drogasil.com.br/search?w={encoded}",
            exigeReceitaFisica=controlado,
            observacao=obs,
        ),
        OnlinePharmacyLink(
            farmacia="Droga Raia",
            urlBusca=f"https://www.drogaraia.com.br/search?w={encoded}",
            exigeReceitaFisica=controlado,
            observacao=obs,
        ),
        OnlinePharmacyLink(
            farmacia="Pague Menos",
            urlBusca=f"https://www.paguemenos.com.br/{encoded}",
            exigeReceitaFisica=controlado,
            observacao=obs,
        ),
        OnlinePharmacyLink(
            farmacia="Panvel",
            urlBusca=f"https://www.panvel.com/panvel/buscarProduto.do?termoPesquisa={encoded}",
            exigeReceitaFisica=controlado,
            observacao=obs,
        ),
        OnlinePharmacyLink(
            farmacia="Consulta Remédios (Comparador)",
            urlBusca=f"https://consultaremedios.com.br/buscar?termo={encoded}",
            exigeReceitaFisica=controlado,
            observacao="Comparador de preços e farmácias credenciadas em todo o Brasil.",
        ),
    ]


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        texts: list[str] = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                texts.append(t)
        return "\n".join(texts)
    except Exception as exc:
        logger.warning("Falha ao extrair texto do PDF com pypdf: %s", exc)
        return ""


def identify_medications_in_text(raw_text: str) -> list[dict[str, Any]]:
    norm = _normalize(raw_text)
    found_profiles: list[dict[str, Any]] = []
    seen_names = set()

    for key, profile in MEDICATION_KNOWLEDGE_BASE.items():
        if key in norm or profile["nome"].lower() in norm:
            if profile["nome"] not in seen_names:
                seen_names.add(profile["nome"])
                found_profiles.append(profile)

    aliases = {
        "rivotril": "clonazepam",
        "fenobarbital": "gardenal",
        "novalgina": "dipirona",
        "escopolamina": "buscopan",
        "eranz": "donepezila",
    }
    for alias, target in aliases.items():
        if alias in norm:
            profile = MEDICATION_KNOWLEDGE_BASE[target]
            if profile["nome"] not in seen_names:
                seen_names.add(profile["nome"])
                found_profiles.append(profile)

    # Se não identificou nenhum catálogo específico mas encontrou menção a medicação genérica
    if not found_profiles and raw_text.strip():
        # Busca padrões de posologia tipo "Nome Remédio 50mg"
        match = re.search(r"([A-Z][a-zçãéíóú]+(?:\s+[A-Z][a-zçãéíóú]+)?)\s+(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|ml))", raw_text)
        if match:
            gen_nome = match.group(1)
            gen_dose = match.group(2)
            found_profiles.append({
                "nome": gen_nome,
                "dosagem": gen_dose,
                "unidade": MedicationUnit.COMPRIMIDO,
                "quantidadePorDoseSugerida": 1.0,
                "quantidadeComprimidos": 30,
                "controlado": False,
                "tipoReceita": PrescriptionType.SIMPLES,
                "origemSugerida": PrescriptionOrigin.ESPECIALIZADO,
                "condicaoSugerida": "Tratamento Prescrito",
                "tipoSugerido": MedicationType.CONTINUO,
                "intervaloHorasSugerido": 12,
                "horariosSugeridos": ["08:00", "20:00"],
                "alertaEstoqueMinimoSugerido": 10,
                "tarja": "Venda sob Prescrição Médica",
                "paraQueServe": f"Medicamento {gen_nome} ({gen_dose}) identificado na receita médica/documento.",
                "alertasPrincipais": [f"Respeite a dosagem prescrita de {gen_dose}.", "Mantenha na embalagem original."],
                "interacoes": ["Informe ao médico os demais remédios em uso."],
                "efeitosColaterais": ["Consulte a bula específica para a lista de reações adversas."],
            })

    return found_profiles


async def consult_pharmacist_agent(
    *,
    pergunta: str = "",
    file_bytes: bytes = b"",
    filename: str = "",
    mime_type: str = "",
    perfil: PatientProfileContext | None = None,
    medicamentos_cadastrados: list[ChatMedicationContext] | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> PharmacistConsultResponse:
    perfil_ctx = perfil or PatientProfileContext(nome="Eu", parentesco=KinshipType.PROPRIO)
    meds_cadastrados = medicamentos_cadastrados or []

    # 1. Extração do conteúdo
    extracted_text = ""
    if file_bytes:
        if "pdf" in mime_type.lower() or filename.lower().endswith(".pdf"):
            extracted_text = extract_text_from_pdf(file_bytes)
        else:
            try:
                extracted_text = file_bytes[:8192].decode("utf-8", errors="ignore")
            except Exception:
                extracted_text = ""

    combined_input = f"{pergunta} {filename} {extracted_text}".strip()

    # 2. Identificação das medicações
    identified_raw = identify_medications_in_text(combined_input)
    if not identified_raw and not file_bytes:
        # Se for pergunta textual simples, tenta match
        single_match = _match_medication_profile(pergunta)
        if single_match:
            identified_raw = [single_match]

    # 3. Montagem dos itens estruturados
    extracted_items: list[ExtractedPrescriptionItem] = []
    alertas_gerais: list[str] = []

    perfil_desc = f"{perfil_ctx.nome} ({perfil_ctx.parentesco.value})"
    if perfil_ctx.idade is not None:
        perfil_desc += f", {perfil_ctx.idade} anos"
    if perfil_ctx.pesoKg is not None:
        perfil_desc += f", {perfil_ctx.pesoKg} kg"
    if perfil_ctx.condicaoClinica:
        perfil_desc += f", Condição: {perfil_ctx.condicaoClinica}"

    is_elderly = perfil_ctx.parentesco == KinshipType.IDOSO or (perfil_ctx.idade is not None and perfil_ctx.idade >= 60)

    for prof in identified_raw:
        nome_med = prof["nome"]
        dose_med = str(prof["dosagem"])
        controlado = bool(prof["controlado"])
        tipo = prof.get("tipoSugerido", MedicationType.CONTINUO)
        origem = prof.get("origemSugerida", PrescriptionOrigin.ESPECIALIZADO)

        # Alertas de segurança e interações com medicamentos já em uso
        alertas_item: list[str] = list(prof.get("alertasPrincipais", []))
        if controlado or tipo == MedicationType.CONTINUO:
            alertas_item.insert(
                0,
                "⚠️ Uso Contínuo / Especializado: NÃO interrompa o uso abruptamente por conta própria. "
                "O desmame deve ser feito gradualmente com supervisão médica.",
            )

        if is_elderly and any(x in nome_med.lower() for x in ("clonazepam", "gardenal", "fenobarbital")):
            alertas_item.insert(
                0,
                f"⚠️ Alerta Geriátrico para {perfil_ctx.nome}: elevado risco de sonolência excessiva, tontura ao levantar "
                "e quedas com fraturas. Cuidado especial à noite.",
            )

        for cad in meds_cadastrados:
            cad_norm = cad.nome.lower()
            if "clonazepam" in nome_med.lower() and "gardenal" in cad_norm:
                alertas_item.append(
                    f"⚠️ Interação com {cad.nome} (já no seu perfil): sedação e depressão respiratória potencializadas. "
                    "Nunca tome no mesmo horário sem autorização expressa do médico."
                )
            elif "donepezila" in cad_norm and "buscopan" in nome_med.lower():
                alertas_item.append(
                    f"⚠️ Antagonismo com {cad.nome} (Alzheimer): o Buscopan tem ação anticolinérgica que reduz a eficácia da Donepezila."
                )

        online_links = build_online_pharmacy_links(nome_med, controlado)

        como_tomar = (
            f"Tomar de {prof['intervaloHorasSugerido']} em {prof['intervaloHorasSugerido']} horas "
            f"({', '.join(prof['horariosSugeridos'])}) — {prof.get('quantidadePorDoseSugerida', 1):g} {prof.get('unidade', MedicationUnit.COMPRIMIDO).value} por dose."
        )

        extracted_items.append(
            ExtractedPrescriptionItem(
                nome=nome_med,
                dosagem=dose_med,
                unidade=prof.get("unidade", MedicationUnit.COMPRIMIDO),
                quantidadePorDose=float(prof.get("quantidadePorDoseSugerida", 1.0)),
                origemPrescricao=origem,
                condicaoTratamento=perfil_ctx.condicaoClinica or prof.get("condicaoSugerida"),
                tipo=tipo,
                controlado=controlado,
                tipoReceita=prof.get("tipoReceita", PrescriptionType.SIMPLES),
                intervaloHoras=int(prof["intervaloHorasSugerido"]),
                horarios=list(prof["horariosSugeridos"]),
                duracaoDias=3 if origem == PrescriptionOrigin.EMERGENCIA else None,
                estoqueSugerido=int(prof.get("quantidadeComprimidos", 30)),
                alertaEstoqueMinimo=int(prof.get("alertaEstoqueMinimoSugerido", 10)),
                paraQueServe=prof["paraQueServe"],
                comoTomar=como_tomar,
                alertasSeguranca=alertas_item,
                ondeComprarOnline=online_links,
            )
        )

    # 4. Busca farmácias físicas locais caso lat/lng fornecidos
    farmacias_fisicas: list[NearbyPharmacy] = []
    if lat is not None and lng is not None:
        try:
            resp_pharm = await find_nearby_pharmacies(lat=lat, lng=lng, radius_meters=3000)
            farmacias_fisicas = resp_pharm.farmacias[:5]
        except Exception:
            pass

    # 5. Resumo geral da consulta do Farmacêutico
    if extracted_items:
        nomes_fmt = ", ".join(f"**{it.nome} {it.dosagem}**" for it in extracted_items)
        resumo = (
            f"Olá! Sou o **🧑‍⚕️ Meu Farmacêutico**, assistente farmacêutico virtual de **{perfil_ctx.nome}**.\n\n"
            f"Analisei seu envio e identifiquei {len(extracted_items)} medicamento(s): {nomes_fmt}.\n"
            "Abaixo você confere para que serve cada um, posologia recomendada, alertas de segurança e interações, "
            "além de drogarias físicas próximas e links diretos para comparar preços online. "
            "Você pode cadastrá-los diretamente no seu cuidado com um único clique."
        )
    else:
        resumo = (
            f"Olá! Sou o **🧑‍⚕️ Meu Farmacêutico**, assistente farmacêutico virtual de **{perfil_ctx.nome}**.\n\n"
            f"Recebi sua mensagem: *\"{pergunta or 'Arquivo analisado'}\"*.\n"
            "Não detectei o nome exato de uma medicação registrada no texto. "
            "Envie uma foto da caixa/cartela ou anexe sua receita médica em PDF para que eu extraia a posologia, "
            "verifique interações e indique onde comprar com os melhores preços."
        )

    return PharmacistConsultResponse(
        perfilConsiderado=perfil_desc,
        resumoConsulta=resumo,
        itensIdentificados=extracted_items,
        farmaciasFisicasProximas=farmacias_fisicas,
        alertasGerais=alertas_gerais,
        geradoEm=datetime.now(timezone.utc),
    )
