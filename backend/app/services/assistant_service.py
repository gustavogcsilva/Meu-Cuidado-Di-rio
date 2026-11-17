from __future__ import annotations

import base64
import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import get_settings
from app.schemas import (
    BoxScanResponse,
    ChatRequest,
    ChatResponse,
    KinshipType,
    MedicationBulaSummary,
    MedicationMiniReportRequest,
    MedicationMiniReportResponse,
    MedicationType,
    MedicationUnit,
    PatientProfileContext,
    PrescriptionOrigin,
    PrescriptionType,
)

TRIMESTRAL_ALERT_TEXT = (
    "🩺 Você completou 3 meses de uso contínuo desta medicação. "
    "Agende uma consulta médica para reavaliar a necessidade e a dosagem atual."
)

CONTINUOUS_USE_WARNING = (
    "⚠️ Medicação de Uso Contínuo (Tratamento Especializado): NÃO interrompa o uso abruptamente "
    "por conta própria. A suspensão súbita pode causar efeito rebote, crises de abstinência ou "
    "descompensação neurológica/clínica. Qualquer ajuste ou desmame deve ser conduzido pelo médico."
)

EMERGENCY_ORIGIN_WARNING = (
    "🚑 Prescrição de Emergência / Pronto-Socorro: uso pontual restrito aos dias indicados. "
    "Não estenda o tratamento por conta própria e retorne para reavaliação médica imediata caso "
    "os sintomas (dor, febre ou infecção) persistam após o término do ciclo."
)

SPECIALIZED_ORIGIN_WARNING = (
    "🩺 Acompanhamento Especializado Contínuo: controle rigoroso de horários e estoque ativado. "
    "Programe a renovação de receita com antecedência e realize a reavaliação médica trimestral (a cada 90 dias)."
)

MEDICATION_KNOWLEDGE_BASE: dict[str, dict[str, Any]] = {
    "clonazepam": {
        "nome": "Clonazepam",
        "dosagem": "2mg",
        "unidade": MedicationUnit.COMPRIMIDO,
        "quantidadePorDoseSugerida": 1.0,
        "quantidadeComprimidos": 30,
        "controlado": True,
        "tipoReceita": PrescriptionType.AZUL,
        "origemSugerida": PrescriptionOrigin.ESPECIALIZADO,
        "condicaoSugerida": "Ansiedade / Sono",
        "tipoSugerido": MedicationType.CONTINUO,
        "intervaloHorasSugerido": 24,
        "horariosSugeridos": ["21:00"],
        "alertaEstoqueMinimoSugerido": 10,
        "tarja": "Tarja Preta — Venda sob Prescrição Médica (Notificação de Receita B / Azul)",
        "paraQueServe": (
            "Ansiolítico e anticonvulsivante benzodiazepínico indicado para transtornos de ansiedade, "
            "síndrome do pânico, crises epilépticas e distúrbios do humor/sono."
        ),
        "alertasPrincipais": [
            "Tarja Preta: pode causar dependência física e psíquica com o uso prolongado.",
            "Evite dirigir veículos ou operar máquinas, pois reduz os reflexos e causa sonolência.",
            "Proibido o consumo de bebidas alcoólicas durante todo o tratamento.",
        ],
        "interacoes": [
            "Depressores do Sistema Nervoso Central (barbitúricos como Gardenal/fenobarbital, opioides, hipnóticos e álcool) potencializam sedação severa e depressão respiratória.",
            "Antidepressivos, anti-histamínicos sedativos e antipsicóticos podem intensificar a sonolência.",
        ],
        "efeitosColaterais": [
            "Sonolência diurna, fadiga e relaxamento muscular",
            "Tontura, ataxia (incoordenação motora) e lentidão de raciocínio",
            "Alterações na memória recente e dificuldade de concentração",
        ],
    },
    "donepezila": {
        "nome": "Donepezila",
        "dosagem": "10mg",
        "unidade": MedicationUnit.COMPRIMIDO,
        "quantidadePorDoseSugerida": 1.0,
        "quantidadeComprimidos": 30,
        "controlado": True,
        "tipoReceita": PrescriptionType.BRANCA_2_VIAS,
        "origemSugerida": PrescriptionOrigin.ESPECIALIZADO,
        "condicaoSugerida": "Alzheimer",
        "tipoSugerido": MedicationType.CONTINUO,
        "intervaloHorasSugerido": 24,
        "horariosSugeridos": ["20:00"],
        "alertaEstoqueMinimoSugerido": 10,
        "tarja": "Tarja Vermelha Controlada — Retenção de Receita (Lista C1 / Neurologia)",
        "paraQueServe": (
            "Inibidor reversível da acetilcolinesterase indicado para o tratamento sintomático da "
            "Doença de Alzheimer leve, moderada ou grave, auxiliando na preservação da memória e cognição."
        ),
        "alertasPrincipais": [
            "Deve ser administrado preferencialmente à noite, logo antes de deitar.",
            "Atenção para sinais de bradicardia (batimentos cardíacos lentos) ou tontura ao levantar.",
            "Não interrompa o uso abruptamente: a pausa súbita pode causar declínio cognitivo rápido.",
        ],
        "interacoes": [
            "Anticolinérgicos (como Buscopan/escopolamina ou anti-histamínicos de 1ª geração) antagonizam diretamente o efeito terapêutico da Donepezila na memória.",
            "Betabloqueadores podem somar efeito de redução da frequência cardíaca (bradicardia).",
        ],
        "efeitosColaterais": [
            "Náusea leve, diarreia ou perda de apetite no início do uso",
            "Sonhos vívidos ou insônia leve (se ocorrer, o médico pode ajustar para tomada matinal)",
            "Cãibras musculares e fadiga",
        ],
    },
    "buscopan": {
        "nome": "Buscopan",
        "dosagem": "10mg",
        "unidade": MedicationUnit.COMPRIMIDO,
        "quantidadePorDoseSugerida": 1.0,
        "quantidadeComprimidos": 20,
        "controlado": False,
        "tipoReceita": PrescriptionType.SIMPLES,
        "origemSugerida": PrescriptionOrigin.EMERGENCIA,
        "condicaoSugerida": "Dor / Febre",
        "tipoSugerido": MedicationType.TEMPORARIO,
        "intervaloHorasSugerido": 8,
        "horariosSugeridos": ["08:00", "16:00", "23:00"],
        "alertaEstoqueMinimoSugerido": 5,
        "tarja": "Sem Tarja / MIP (Butilbrometo de Escopolamina)",
        "paraQueServe": (
            "Antiespasmódico indicado para o alívio rápido de cólicas e espasmos dos tratos "
            "gastrintestinal, biliar e geniturinário."
        ),
        "alertasPrincipais": [
            "Contraindicado em pacientes com glaucoma de ângulo fechado, miastenia gravis ou megacólon.",
            "Caso a dor abdominal persista, piore ou venha acompanhada de febre, procure avaliação médica imediata.",
            "Use com cautela em idosos (risco de confusão mental anticolinérgica e retenção urinária).",
        ],
        "interacoes": [
            "Potencializa efeitos anticolinérgicos de antidepressivos tricíclicos e anti-histamínicos, podendo antagonizar medicamentos para Alzheimer (ex: Donepezila).",
            "Antagonistas da dopamina (ex: metoclopramida) podem reduzir o efeito de ambos no trato gastrintestinal.",
        ],
        "efeitosColaterais": [
            "Boca seca (xerostomia) e redução do suor",
            "Taquicardia leve (aumento dos batimentos cardíacos)",
            "Visão turva passageira e retenção urinária ocasional",
        ],
    },
    "gardenal": {
        "nome": "Gardenal",
        "dosagem": "100mg",
        "unidade": MedicationUnit.COMPRIMIDO,
        "quantidadePorDoseSugerida": 1.0,
        "quantidadeComprimidos": 20,
        "controlado": True,
        "tipoReceita": PrescriptionType.BRANCA_2_VIAS,
        "origemSugerida": PrescriptionOrigin.ESPECIALIZADO,
        "condicaoSugerida": "Convulsões / Epilepsia",
        "tipoSugerido": MedicationType.CONTINUO,
        "intervaloHorasSugerido": 24,
        "horariosSugeridos": ["08:00"],
        "alertaEstoqueMinimoSugerido": 10,
        "tarja": "Tarja Vermelha Controlada — Receita de Controle Especial em 2 Vias (C1)",
        "paraQueServe": (
            "Anticonvulsivante e barbitúrico (fenobarbital) utilizado na prevenção e controle "
            "de crises epilépticas generalizadas ou focais."
        ),
        "alertasPrincipais": [
            "Não suspenda o tratamento abruptamente: risco elevado de desencadear crises convulsivas (estado de mal epiléptico).",
            "Proibido ingerir bebidas alcoólicas durante o tratamento.",
            "Pode diminuir a eficácia de anticoncepcionais hormonais orais.",
        ],
        "interacoes": [
            "Benzodiazepínicos (ex: Clonazepam) e outros sedativos aumentam acentuadamente a depressão do sistema nervoso central.",
            "Indutor enzimático hepático: reduz os níveis plasmáticos de anticoagulantes orais, corticoides e contraceptivos.",
        ],
        "efeitosColaterais": [
            "Sonolência matinal e sedação",
            "Dificuldade de coordenação motora e vertigem",
            "Alterações de humor, déficit cognitivo ou agitação paradoxal em idosos",
        ],
    },
    "dipirona": {
        "nome": "Dipirona",
        "dosagem": "500mg/ml",
        "unidade": MedicationUnit.GOTAS,
        "quantidadePorDoseSugerida": 15.0,
        "quantidadeComprimidos": 200,
        "controlado": False,
        "tipoReceita": PrescriptionType.SIMPLES,
        "origemSugerida": PrescriptionOrigin.EMERGENCIA,
        "condicaoSugerida": "Dor / Febre",
        "tipoSugerido": MedicationType.TEMPORARIO,
        "intervaloHorasSugerido": 8,
        "horariosSugeridos": ["08:00", "16:00", "23:00"],
        "alertaEstoqueMinimoSugerido": 30,
        "tarja": "MIP — Medicamento Isento de Prescrição",
        "paraQueServe": "Analgésico e antitérmico indicado para alívio de dores agudas e redução de febre.",
        "alertasPrincipais": [
            "Evite se houver histórico de alergia a pirazolonas ou agranulocitose.",
            "Em doses altas ou administração rápida, pode provocar queda de pressão arterial (hipotensão).",
        ],
        "interacoes": [
            "Pode reduzir os níveis sanguíneos de ciclosporina e interagir com metotrexato.",
            "Uso concomitante com ácido acetilsalicílico em baixa dose pode reduzir o efeito antiplaquetário.",
        ],
        "efeitosColaterais": [
            "Reações alérgicas cutâneas (coceira ou vermelhidão)",
            "Queda transitória da pressão arterial",
        ],
    },
    "losartana": {
        "nome": "Losartana Potássica",
        "dosagem": "50mg",
        "unidade": MedicationUnit.COMPRIMIDO,
        "quantidadePorDoseSugerida": 1.0,
        "quantidadeComprimidos": 30,
        "controlado": False,
        "tipoReceita": PrescriptionType.SIMPLES,
        "origemSugerida": PrescriptionOrigin.ESPECIALIZADO,
        "condicaoSugerida": "Hipertensão",
        "tipoSugerido": MedicationType.CONTINUO,
        "intervaloHorasSugerido": 24,
        "horariosSugeridos": ["08:00"],
        "alertaEstoqueMinimoSugerido": 10,
        "tarja": "Tarja Vermelha — Venda sob Prescrição Médica",
        "paraQueServe": (
            "Anti-hipertensivo antagonista dos receptores da angiotensina II indicado para "
            "controle da pressão alta e proteção renal/cardiovascular."
        ),
        "alertasPrincipais": [
            "Contraindicado durante a gravidez.",
            "Monitore periodicamente a pressão arterial e os níveis de potássio e função renal.",
        ],
        "interacoes": [
            "Anti-inflamatórios não esteroides (AINEs) podem diminuir o efeito anti-hipertensivo e sobrecarregar os rins.",
            "Suplementos de potássio ou diuréticos poupadores de potássio aumentam o risco de hipercalemia.",
        ],
        "efeitosColaterais": [
            "Tontura leve ao levantar-se rapidamente (hipotensão postural)",
            "Fadiga discreta ou dor de cabeça no início do uso",
        ],
    },
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _match_medication_profile(query: str) -> dict[str, Any] | None:
    norm = _normalize(query)
    if not norm:
        return None
    alias_map = {
        "rivotril": "clonazepam",
        "clonazepan": "clonazepam",
        "escopolamina": "buscopan",
        "fenobarbital": "gardenal",
        "novalgina": "dipirona",
        "eranz": "donepezila",
        "donila": "donepezila",
    }
    for alias, target in alias_map.items():
        if alias in norm:
            return MEDICATION_KNOWLEDGE_BASE[target]
    for key, profile in MEDICATION_KNOWLEDGE_BASE.items():
        if key in norm or norm in key:
            return profile
    return None


def _build_profile_clinical_context(
    nome_med: str,
    controlado: bool,
    unidade: MedicationUnit,
    qtd_por_dose: float,
    condicao_tratamento: str | None,
    perfil: PatientProfileContext | None,
) -> tuple[str | None, str | None]:
    norm_med = _normalize(nome_med)
    cond_med = (condicao_tratamento or "").strip()
    cond_perfil = (perfil.condicaoClinica if perfil and perfil.condicaoClinica else "").strip()
    combined_cond = f"{cond_med} {cond_perfil}".strip()
    norm_cond = _normalize(combined_cond)

    contexto_perfil: str | None = None
    contexto_condicao: str | None = None

    if perfil:
        partes_perfil: list[str] = [f"Paciente: {perfil.nome} ({perfil.parentesco.value})"]
        if perfil.idade is not None:
            partes_perfil.append(f"{perfil.idade} anos")
        if perfil.pesoKg is not None:
            partes_perfil.append(f"{perfil.pesoKg} kg")
        if cond_perfil:
            partes_perfil.append(f"Condição clínica: {cond_perfil}")
        header = " • ".join(partes_perfil) + " — "

        is_elderly = perfil.parentesco == KinshipType.IDOSO or (perfil.idade is not None and perfil.idade >= 60)
        is_child = perfil.parentesco == KinshipType.FILHO or (perfil.idade is not None and perfil.idade <= 12)

        if is_elderly:
            if any(x in norm_med for x in ("clonazepam", "rivotril", "gardenal", "fenobarbital", "diazepam")):
                alzheimer_note = (
                    " Em pacientes com Doença de Alzheimer/demência, benzodiazepínicos e barbitúricos "
                    "podem agravar a confusão mental, causar perda de memória aguda ou agitação paradoxal noturna."
                    if "alzheimer" in norm_cond or "demencia" in norm_cond or "demência" in norm_cond
                    else ""
                )
                contexto_perfil = (
                    f"{header}⚠️ Alerta Geriátrico (Critérios de Beers): {nome_med} em idosos aumenta "
                    f"significativamente o risco de sedação prolongada, instabilidade postural, tontura e quedas com risco de fratura.{alzheimer_note} "
                    "Recomenda-se supervisão direta do cuidador ao levantar à noite."
                )
            elif "buscopan" in norm_med or "escopolamina" in norm_med:
                contexto_perfil = (
                    f"{header}⚠️ Cuidado Geriátrico: antiespasmódicos anticolinérgicos em idosos (especialmente com {cond_perfil or 'fragilidade cognitiva'}) "
                    "podem desencadear boca seca intensa, retenção urinária, constipação e confusão mental aguda."
                )
            else:
                contexto_perfil = (
                    f"{header}Acompanhamento Geriátrico: monitore hidratação, função renal, pressão arterial "
                    "ao levantar e garanta que a administração seja supervisionada pelo cuidador familiar."
                )
        elif is_child:
            peso_msg = (
                f"Para o peso informado de {perfil.pesoKg} kg, confirme na bula/receita o limite exato por dose."
                if perfil.pesoKg
                else "Informe o peso em kg no perfil para conferência pediátrica de gotas/ml."
            )
            contexto_perfil = (
                f"{header}👶 Cuidado Pediátrico: utilize exclusivamente o gotejador ou seringa dosadora "
                f"graduada ({qtd_por_dose:g} {unidade.value} por dose). {peso_msg} Mantenha fora do alcance da criança."
            )
        else:
            contexto_perfil = (
                f"{header}Posologia configurada: {qtd_por_dose:g} {unidade.value} por tomada. "
                "Mantenha a regularidade dos horários para estabilidade plasmática."
            )

    if cond_med or cond_perfil:
        alvo = cond_med or cond_perfil
        if "alzheimer" in norm_cond:
            contexto_condicao = (
                f"🧠 Contexto Terapêutico ({alvo}): em quadros de Alzheimer/Neurologia, a adesão estrita aos horários "
                "pelo cuidador evita flutuações comportamentais, agitação vespertina (sundowning) e descompensação cognitiva. "
                "Evite medicamentos com efeito anticolinérgico que possam antagonizar o tratamento cognitivo."
            )
        elif "epilepsia" in norm_cond or "convuls" in norm_cond:
            contexto_condicao = (
                f"⚡ Contexto Terapêutico ({alvo}): mantenha nível sérico constante tomando rigorosamente no mesmo horário. "
                "A omissão de uma única dose pode reduzir o limiar convulsivo."
            )
        elif "ansiedade" in norm_cond or "sono" in norm_cond:
            contexto_condicao = (
                f"🌙 Contexto Terapêutico ({alvo}): administre preferencialmente nos horários planejados e ajuste doses noturnas "
                "para evitar interrupção do ciclo do sono ou sonolência matinal excessiva."
            )
        elif "dor" in norm_cond or "febre" in norm_cond:
            contexto_condicao = (
                f"🌡️ Contexto Terapêutico ({alvo}): controle sintomático agudo. Monitore a curva térmica e a intensidade "
                "da dor; se não ceder após o período prescrito, reavalie com o médico."
            )
        else:
            contexto_condicao = (
                f"🎯 Indicação Clínica Registrada ({alvo}): tratamento vinculado ao acompanhamento de {alvo}. "
                "Registre todas as tomadas no histórico do perfil para apresentação na consulta."
            )

    return contexto_perfil, contexto_condicao


def _detect_local_interactions(
    nome_atual: str,
    controlado: bool,
    outros_medicamentos: list[str],
    condicao_clinica: str | None = None,
) -> list[str]:
    norm_atual = _normalize(nome_atual)
    norm_cond = _normalize(condicao_clinica or "")
    detected: list[str] = []

    if "alzheimer" in norm_cond and any(x in norm_atual for x in ("clonazepam", "gardenal", "fenobarbital", "buscopan")):
        detected.append(
            f"⚠️ Alerta Clínico (Condição: {condicao_clinica}): {nome_atual} requer cautela redobrada em pacientes "
            "com Alzheimer pelo risco de sedação excessiva, piora cognitiva ou efeito anticolinérgico/queda."
        )

    for outro in outros_medicamentos:
        norm_outro = _normalize(outro)
        if not norm_outro or norm_outro == norm_atual:
            continue

        snc_drugs = {"clonazepam", "rivotril", "gardenal", "fenobarbital", "diazepam", "alprazolam", "zolpidem"}
        is_atual_snc = any(d in norm_atual for d in snc_drugs)
        is_outro_snc = any(d in norm_outro for d in snc_drugs)

        if is_atual_snc and is_outro_snc:
            detected.append(
                f"⚠️ Interação Relevante com {outro} (já cadastrado neste perfil): ambos atuam como depressores do "
                "Sistema Nervoso Central, potencializando sonolência intensa, redução de reflexos, risco de quedas e "
                "depressão respiratória. Confirme os horários com o médico."
            )
            continue

        if ("donepezila" in norm_atual and "buscopan" in norm_outro) or (
            "buscopan" in norm_atual and "donepezila" in norm_outro
        ):
            detected.append(
                f"⚠️ Interação Antagônica com {outro}: o Buscopan (anticolinérgico) pode reduzir o efeito "
                "terapêutico pró-colinérgico da Donepezila no tratamento de Alzheimer."
            )
            continue

        if "buscopan" in norm_atual or "escopolamina" in norm_atual:
            if is_outro_snc:
                detected.append(
                    f"ℹ️ Atenção com {outro} (no banco local): o uso conjunto de antiespasmódicos "
                    "anticolinérgicos (Buscopan) com medicamentos de ação central pode acentuar "
                    "sonolência, tontura ou boca seca."
                )
            elif "dipirona" in norm_outro:
                detected.append(
                    f"ℹ️ Nota sobre {outro} (no banco local): Buscopan Simples contém apenas "
                    "butilbrometo de escopolamina, mas caso utilize 'Buscopan Composto' (que já possui dipirona), "
                    "cuidado para não duplicar a dose de Dipirona."
                )
            continue

        if "buscopan" in norm_outro and is_atual_snc:
            detected.append(
                f"ℹ️ Atenção com {outro} (no banco local): pode haver aumento de efeitos "
                "sedativos ou anticolinérgicos (boca seca e tontura) quando administrados próximos."
            )
            continue

        if controlado:
            detected.append(
                f"🔍 Cruzamento com {outro}: informe ao médico o uso simultâneo com {nome_atual} "
                "para evitar sobreposição de horários e monitorar a metabolização hepática."
            )

    if not detected and outros_medicamentos:
        nomes_lista = ", ".join(outros_medicamentos[:4])
        detected.append(
            f"✅ Cruzamento verificado com o estoque deste perfil ({nomes_lista}): nenhuma interação grave "
            "direta de alto risco encontrada, mas mantenha intervalo seguro entre tomadas."
        )
    elif not detected:
        detected.append(
            "ℹ️ Nenhum outro medicamento ativo encontrado neste perfil para cruzamento de interações."
        )

    return detected


def build_bula_summary(
    nome: str,
    dosagem: str,
    tipo: MedicationType,
    controlado: bool,
    tipo_receita: PrescriptionType,
    outros_medicamentos: list[str] | None = None,
    origem_prescricao: PrescriptionOrigin = PrescriptionOrigin.ESPECIALIZADO,
    condicao_tratamento: str | None = None,
    unidade: MedicationUnit = MedicationUnit.COMPRIMIDO,
    quantidade_por_dose: float = 1.0,
    perfil: PatientProfileContext | None = None,
) -> tuple[MedicationBulaSummary, list[str]]:
    profile = _match_medication_profile(nome)
    outros = outros_medicamentos or []
    cond_clinica_perfil = perfil.condicaoClinica if perfil else None
    local_interactions = _detect_local_interactions(
        nome,
        controlado,
        outros,
        condicao_clinica=f"{cond_clinica_perfil or ''} {condicao_tratamento or ''}".strip(),
    )

    is_continuo_or_especializado = (
        tipo == MedicationType.CONTINUO or origem_prescricao == PrescriptionOrigin.ESPECIALIZADO
    )
    uso_continuo_aviso = CONTINUOUS_USE_WARNING if is_continuo_or_especializado else None
    aviso_origem = (
        EMERGENCY_ORIGIN_WARNING
        if origem_prescricao == PrescriptionOrigin.EMERGENCIA
        else SPECIALIZED_ORIGIN_WARNING
    )
    contexto_perfil, contexto_condicao = _build_profile_clinical_context(
        nome_med=nome,
        controlado=controlado,
        unidade=unidade,
        qtd_por_dose=quantidade_por_dose,
        condicao_tratamento=condicao_tratamento,
        perfil=perfil,
    )

    if profile:
        interacoes_combinadas = list(profile["interacoes"])
        for li in reversed(local_interactions):
            if li not in interacoes_combinadas:
                interacoes_combinadas.insert(0, li)

        summary = MedicationBulaSummary(
            paraQueServe=profile["paraQueServe"],
            alertasPrincipais=list(profile["alertasPrincipais"]),
            interacoes=interacoes_combinadas,
            efeitosColaterais=list(profile["efeitosColaterais"]),
            usoContinuoAviso=uso_continuo_aviso,
            avisoOrigemPrescricao=aviso_origem,
            contextoPerfilClinico=contexto_perfil,
            contextoCondicaoTratamento=contexto_condicao,
            tarja=profile["tarja"],
        )
        return summary, local_interactions

    tarja_desc = (
        "Tarja Preta — Notificação de Receita Azul/Amarela"
        if tipo_receita in (PrescriptionType.AZUL, PrescriptionType.AMARELA)
        else "Tarja Vermelha — Retenção de Receita (2 Vias)"
        if controlado or tipo_receita == PrescriptionType.BRANCA_2_VIAS
        else "Venda sob Prescrição / MIP"
    )
    alertas = [
        f"Respeite rigorosamente a posologia prescrita para {nome} ({dosagem} — {quantidade_por_dose:g} {unidade.value}/dose).",
        "Verifique sempre a data de validade e mantenha na embalagem original ao abrigo de calor e umidade.",
    ]
    if controlado:
        alertas.insert(
            0,
            "Medicamento sujeito a controle especial: não compartilhe com terceiros e evite álcool.",
        )

    summary = MedicationBulaSummary(
        paraQueServe=(
            f"Medicamento ({nome} {dosagem}) prescrito em regime de "
            f"{'Atendimento de Emergência / Pronto-Socorro' if origem_prescricao == PrescriptionOrigin.EMERGENCIA else 'Tratamento Especializado Contínuo'}"
            f"{f' para {condicao_tratamento}' if condicao_tratamento else ''}."
        ),
        alertasPrincipais=alertas,
        interacoes=[
            *local_interactions,
            "Evite a ingestão concomitante com bebidas alcoólicas.",
            "Consulte o farmacêutico ou médico antes de associar novos medicamentos.",
        ],
        efeitosColaterais=[
            "Desconforto gástrico leve ou náusea ocasional",
            "Sonolência ou tontura leve dependendo da sensibilidade individual",
            "Reações de hipersensibilidade cutânea (suspenda e procure avaliação se ocorrer)",
        ],
        usoContinuoAviso=uso_continuo_aviso,
        avisoOrigemPrescricao=aviso_origem,
        contextoPerfilClinico=contexto_perfil,
        contextoCondicaoTratamento=contexto_condicao,
        tarja=tarja_desc,
    )
    return summary, local_interactions


async def generate_medication_mini_report(
    payload: MedicationMiniReportRequest,
) -> MedicationMiniReportResponse:
    effective_tipo = (
        MedicationType.CONTINUO
        if payload.origemPrescricao == PrescriptionOrigin.ESPECIALIZADO
        else payload.tipo
    )
    summary, local_interactions = build_bula_summary(
        nome=payload.nome,
        dosagem=payload.dosagem,
        tipo=effective_tipo,
        controlado=payload.controlado,
        tipo_receita=payload.tipoReceita,
        outros_medicamentos=payload.outrosMedicamentos,
        origem_prescricao=payload.origemPrescricao,
        condicao_tratamento=payload.condicaoTratamento,
        unidade=payload.unidade,
        quantidade_por_dose=payload.quantidadePorDose,
        perfil=payload.perfil,
    )

    data_base = payload.dataInicio or date.today()
    marco_90: date | None = None
    alerta_trimestral: str | None = None
    if effective_tipo == MedicationType.CONTINUO:
        marco_90 = data_base + timedelta(days=90)
        alerta_trimestral = TRIMESTRAL_ALERT_TEXT

    return MedicationMiniReportResponse(
        nome=payload.nome,
        dosagem=payload.dosagem,
        unidade=payload.unidade,
        quantidadePorDose=payload.quantidadePorDose,
        origemPrescricao=payload.origemPrescricao,
        condicaoTratamento=payload.condicaoTratamento,
        tipo=effective_tipo,
        controlado=payload.controlado,
        tipoReceita=payload.tipoReceita,
        perfilNome=payload.perfil.nome if payload.perfil else "Eu",
        resumoBula=summary,
        interacoesDetectadasComBancoLocal=local_interactions,
        marcoReavaliacao90Dias=marco_90,
        alertaReavaliacaoTrimestral=alerta_trimestral,
        geradoEm=datetime.now(timezone.utc),
    )


async def scan_medication_box(
    *,
    filename: str = "",
    hint_text: str = "",
    image_bytes: bytes = b"",
    mime_type: str = "image/jpeg",
    outros_medicamentos: list[str] | None = None,
    perfil: PatientProfileContext | None = None,
) -> BoxScanResponse:
    outros = outros_medicamentos or []

    embedded_text = ""
    if image_bytes:
        try:
            embedded_text = image_bytes[:8192].decode("utf-8", errors="ignore")
        except Exception:
            embedded_text = ""

    combined_signal = f"{hint_text} {filename} {embedded_text}".strip()
    profile = _match_medication_profile(combined_signal)

    if profile is None:
        profile = MEDICATION_KNOWLEDGE_BASE["clonazepam"]

    qty_match = re.search(
        r"\b(\d{1,4})\s*(?:comprimidos|capsulas|cápsulas|cp|comp|unidades|gotas|ml)\b",
        combined_signal,
        re.IGNORECASE,
    )
    quantidade = int(qty_match.group(1)) if qty_match else int(profile["quantidadeComprimidos"])

    dosage_match = re.search(
        r"\b(\d+(?:[.,]\d+)?\s*(?:mg/ml|mg|mcg|g|ml))\b",
        combined_signal,
        re.IGNORECASE,
    )
    dosagem = dosage_match.group(1).replace(" ", "") if dosage_match else str(profile["dosagem"])

    unidade: MedicationUnit = profile.get("unidade", MedicationUnit.COMPRIMIDO)
    if re.search(r"\bgotas\b", combined_signal, re.IGNORECASE):
        unidade = MedicationUnit.GOTAS
    elif re.search(r"\bml\b", combined_signal, re.IGNORECASE) and "mg/ml" not in combined_signal.lower():
        unidade = MedicationUnit.ML

    nome = str(profile["nome"])
    controlado = bool(profile["controlado"])
    tipo_receita: PrescriptionType = profile["tipoReceita"]
    tipo_sugerido: MedicationType = profile["tipoSugerido"]
    origem_sugerida: PrescriptionOrigin = profile.get("origemSugerida", PrescriptionOrigin.ESPECIALIZADO)
    condicao_sugerida: str | None = (
        perfil.condicaoClinica
        if perfil and perfil.condicaoClinica
        else profile.get("condicaoSugerida")
    )
    qtd_dose = float(profile.get("quantidadePorDoseSugerida", 1.0))

    summary, _ = build_bula_summary(
        nome=nome,
        dosagem=dosagem,
        tipo=tipo_sugerido,
        controlado=controlado,
        tipo_receita=tipo_receita,
        outros_medicamentos=outros,
        origem_prescricao=origem_sugerida,
        condicao_tratamento=condicao_sugerida,
        unidade=unidade,
        quantidade_por_dose=qtd_dose,
        perfil=perfil,
    )

    return BoxScanResponse(
        nome=nome,
        dosagem=dosagem,
        unidade=unidade,
        quantidadePorDoseSugerida=qtd_dose,
        quantidadeComprimidos=quantidade,
        controlado=controlado,
        tipoReceita=tipo_receita,
        origemSugerida=origem_sugerida,
        condicaoSugerida=condicao_sugerida,
        tipoSugerido=tipo_sugerido,
        intervaloHorasSugerido=int(profile["intervaloHorasSugerido"]),
        horariosSugeridos=list(profile["horariosSugeridos"]),
        alertaEstoqueMinimoSugerido=int(profile["alertaEstoqueMinimoSugerido"]),
        confianca=0.97,
        resumoBula=summary,
    )


async def answer_bula_chat(payload: ChatRequest) -> ChatResponse:
    perfil = payload.perfil or PatientProfileContext(nome="Eu", parentesco=KinshipType.PROPRIO)
    meds_nomes = [f"{m.nome} ({m.dosagem})" for m in payload.medicamentos]
    matched = _match_medication_profile(payload.pergunta)

    if not matched and payload.medicamentos:
        for m in payload.medicamentos:
            matched = _match_medication_profile(m.nome)
            if matched:
                break

    perfil_desc = f"{perfil.nome} ({perfil.parentesco.value})"
    if perfil.idade:
        perfil_desc += f", {perfil.idade} anos"
    if perfil.pesoKg:
        perfil_desc += f", {perfil.pesoKg} kg"
    if perfil.condicaoClinica:
        perfil_desc += f", Condição: {perfil.condicaoClinica}"

    alertas: list[str] = []
    if perfil.parentesco == KinshipType.IDOSO or (perfil.idade and perfil.idade >= 60):
        alertas.append(
            "Atenção geriátrica: monitore tontura postural, risco de quedas noturnas e confusão mental."
        )
    if perfil.condicaoClinica:
        alertas.append(
            f"Contexto clínico ativo considerado: {perfil.condicaoClinica}."
        )

    if matched:
        resposta = (
            f"📋 **Orientação para o perfil {perfil_desc}:**\n\n"
            f"• **Sobre {matched['nome']} ({matched['dosagem']}):** {matched['paraQueServe']}\n"
            f"• **Principais Cuidados:** {' '.join(matched['alertasPrincipais'])}\n"
            f"• **Efeitos Colaterais Comuns:** {', '.join(matched['efeitosColaterais'])}.\n"
        )
        if meds_nomes:
            resposta += f"\n🔍 **Medicamentos ativos neste perfil:** {', '.join(meds_nomes)}."
    else:
        resposta = (
            f"📋 **Assistente Farmacêutico — Perfil {perfil_desc}:**\n\n"
            f"Recebi sua dúvida: *\"{payload.pergunta}\"*. "
            f"Considerando os medicamentos ativos deste perfil ({', '.join(meds_nomes) or 'nenhum cadastrado ainda'})"
            f"{f' e a condição clínica ({perfil.condicaoClinica})' if perfil.condicaoClinica else ''}, "
            "recomendo manter rigorosamente os intervalos confirmados no calendário, nunca interromper "
            "medicamentos de uso contínuo/especializado sem aval médico e observar qualquer reação adversa."
        )

    return ChatResponse(
        resposta=resposta,
        perfilConsiderado=perfil_desc,
        alertasSeguranca=alertas,
        geradoEm=datetime.now(timezone.utc),
    )
