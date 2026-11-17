from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from app.config import get_settings
from app.schemas import (
    AlertCategory,
    AutomatedAlertItem,
    EvaluateAlertsResponse,
    MedicationCreate,
    MedicationType,
    PrescriptionOrigin,
    PrescriptionType,
    PushWebhookSubscriptionRequest,
    SchedulerStatusResponse,
)

logger = logging.getLogger("meu_cuidado_diario.alert_automator")

TRIMESTRAL_REEVALUATION_MESSAGE = (
    "🩺 Você completou 3 meses de uso contínuo desta medicação. "
    "Agende uma consulta médica para reavaliar a necessidade e a dosagem atual."
)


def _format_dose_unit(qtd: float, unidade: str) -> str:
    qtd_str = f"{int(qtd)}" if qtd == int(qtd) else f"{qtd:g}"
    if unidade == "comprimido":
        return f"{qtd_str} {'comprimido' if qtd == 1 else 'comprimidos'}"
    if unidade == "capsula":
        return f"{qtd_str} {'cápsula' if qtd == 1 else 'cápsulas'}"
    if unidade == "gotas":
        return f"{qtd_str} {'gota' if qtd == 1 else 'gotas'}"
    if unidade == "ml":
        return f"{qtd_str} ml"
    return f"{qtd_str} {unidade}"


class AlertAutomatorService:
    """Motor de automação e fila consolidada de alertas Multi-Perfil (APScheduler + Web Push / Webhook + ICS)."""

    def __init__(self) -> None:
        self.scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
        self.alert_queue: list[AutomatedAlertItem] = []
        self.subscriptions: list[PushWebhookSubscriptionRequest] = []
        self._started = False

    def start(self) -> None:
        if not self._started:
            self.scheduler.start()
            self._started = True
            self.scheduler.add_job(
                self._heartbeat_dispatch,
                trigger=CronTrigger(minute="*/15"),
                id="consolidated_alert_sweep",
                replace_existing=True,
            )

    def shutdown(self) -> None:
        if self._started and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            self._started = False

    def register_subscription(self, sub: PushWebhookSubscriptionRequest) -> int:
        existing_endpoints = {item.endpoint for item in self.subscriptions}
        if sub.endpoint not in existing_endpoints:
            self.subscriptions.append(sub)
        return len(self.subscriptions)

    def _heartbeat_dispatch(self) -> None:
        if not self.alert_queue:
            return
        logger.info("APScheduler sweep: %d alertas ativos na fila.", len(self.alert_queue))

    async def dispatch_webhook(
        self,
        alerts: list[AutomatedAlertItem],
        webhook_url: str | None = None,
    ) -> bool:
        settings = get_settings()
        target_url = webhook_url or settings.default_webhook_url
        targets = [target_url] if target_url else []
        for sub in self.subscriptions:
            if sub.endpoint.startswith("http"):
                targets.append(sub.endpoint)

        if not targets or not alerts:
            return False

        payload = {
            "app": "Meu Cuidado Diário",
            "disparadoEm": datetime.now(timezone.utc).isoformat(),
            "totalAlertas": len(alerts),
            "alertas": [a.model_dump() for a in alerts],
        }
        success = False
        async with httpx.AsyncClient(timeout=5.0) as client:
            for url in set(targets):
                try:
                    await client.post(url, json=payload)
                    success = True
                except Exception as exc:
                    logger.warning("Falha ao disparar webhook para %s: %s", url, exc)
        return success

    def evaluate_medications(
        self,
        medications: list[MedicationCreate],
        reference_date: date | None = None,
    ) -> EvaluateAlertsResponse:
        self.start()
        ref_date = reference_date or date.today()
        generated: list[AutomatedAlertItem] = []

        for idx, med in enumerate(medications):
            if not med.ativo:
                continue

            perfil_nome = (med.perfilNome or "Eu").strip()
            slug = f"p{med.profileId}-{idx}-{med.nome.lower().replace(' ', '-')}"
            tomadas_por_dia = max(1, len(med.horarios) or max(1, 24 // max(1, med.intervaloHoras)))
            consumo_diario = tomadas_por_dia * max(0.1, float(med.quantidadePorDose or 1.0))
            dose_label = _format_dose_unit(med.quantidadePorDose, med.unidade.value)

            # 1. Lembretes de horário de dose prefixados com [Perfil]
            for horario in med.horarios:
                alert_id = f"dose-{slug}-{horario.replace(':', '')}"
                generated.append(
                    AutomatedAlertItem(
                        id=alert_id,
                        profileId=med.profileId,
                        perfilNome=perfil_nome,
                        categoria=AlertCategory.DOSE_HORARIO,
                        severidade="info",
                        medicamentoNome=med.nome,
                        medicamentoDosagem=med.dosagem,
                        titulo=f"⏰ [{perfil_nome}] {horario} — {med.nome} ({dose_label})",
                        mensagem=(
                            f"Administrar {dose_label} de {med.nome} ({med.dosagem}) para {perfil_nome} às {horario} "
                            f"(de {med.intervaloHoras} em {med.intervaloHoras} horas)."
                        ),
                        dataReferencia=f"{ref_date.isoformat()}T{horario}:00",
                        requerGpsFarmacias=False,
                    )
                )
                try:
                    hh, mm = [int(p) for p in horario.split(":")[:2]]
                    self.scheduler.add_job(
                        self._heartbeat_dispatch,
                        trigger=CronTrigger(hour=hh, minute=mm),
                        id=alert_id,
                        replace_existing=True,
                    )
                except Exception:
                    pass

            # 2. Alerta de estoque baixo (com gatilho para exibir Mini-Mapa de farmácias via GPS)
            if med.estoqueAtual <= med.alertaEstoqueMinimo:
                generated.append(
                    AutomatedAlertItem(
                        id=f"estoque-{slug}",
                        profileId=med.profileId,
                        perfilNome=perfil_nome,
                        categoria=AlertCategory.ESTOQUE_BAIXO,
                        severidade="critical" if med.estoqueAtual <= 3 else "warning",
                        medicamentoNome=med.nome,
                        medicamentoDosagem=med.dosagem,
                        titulo=f"📦 [{perfil_nome}] Estoque Baixo — {med.nome} ({med.estoqueAtual:g} {med.unidade.value})",
                        mensagem=(
                            f"Restam apenas {med.estoqueAtual:g} {med.unidade.value} de {med.nome} para {perfil_nome} "
                            f"(mínimo: {med.alertaEstoqueMinimo:g}). Abra o Mini-Mapa GPS para localizar farmácias num raio de 3 km."
                        ),
                        dataReferencia=ref_date.isoformat(),
                        requerGpsFarmacias=True,
                    )
                )

            # 3. Alerta de renovação de receita controlada
            dias_autonomia = int(med.estoqueAtual // consumo_diario)
            if med.controlado and (med.estoqueAtual <= med.alertaEstoqueMinimo + 5 or dias_autonomia <= 10):
                tipo_label = {
                    PrescriptionType.AZUL: "Receita Azul (Notificação B)",
                    PrescriptionType.AMARELA: "Receita Amarela (Notificação A)",
                    PrescriptionType.BRANCA_2_VIAS: "Receita Branca em 2 Vias (Controle Especial C1)",
                    PrescriptionType.SIMPLES: "Receita Médica",
                }.get(med.tipoReceita, "Receita Controlada")

                generated.append(
                    AutomatedAlertItem(
                        id=f"receita-{slug}",
                        profileId=med.profileId,
                        perfilNome=perfil_nome,
                        categoria=AlertCategory.RENOVACAO_RECEITA,
                        severidade="warning",
                        medicamentoNome=med.nome,
                        medicamentoDosagem=med.dosagem,
                        titulo=f"📋 [{perfil_nome}] Renovação de Receita — {med.nome}",
                        mensagem=(
                            f"Autonomia estimada para {dias_autonomia} dia(s). Providencie a renovação da "
                            f"{tipo_label} de {perfil_nome} com antecedência."
                        ),
                        dataReferencia=ref_date.isoformat(),
                        requerGpsFarmacias=False,
                    )
                )

            # 4. Comportamento diferenciado por Origem da Prescrição (Emergência vs Tratamento Especializado)
            if med.origemPrescricao == PrescriptionOrigin.EMERGENCIA and med.duracaoDias:
                dias_passados = max(0, (ref_date - med.dataInicio).days)
                dias_restantes = max(0, med.duracaoDias - dias_passados)
                data_fim = med.dataInicio + timedelta(days=med.duracaoDias)
                generated.append(
                    AutomatedAlertItem(
                        id=f"emergencia-{slug}",
                        profileId=med.profileId,
                        perfilNome=perfil_nome,
                        categoria=AlertCategory.FIM_TRATAMENTO_EMERGENCIA,
                        severidade="warning" if dias_restantes <= 1 else "info",
                        medicamentoNome=med.nome,
                        medicamentoDosagem=med.dosagem,
                        titulo=(
                            f"🚑 [{perfil_nome}] Contagem Regressiva PS ({dias_restantes}d restantes) — {med.nome}"
                        ),
                        mensagem=(
                            f"Prescrição de Emergência por {med.duracaoDias} dias (término em {data_fim.strftime('%d/%m/%Y')}). "
                            "Não estenda o uso sem reavaliação e retorne ao médico caso os sintomas persistam."
                        ),
                        dataReferencia=data_fim.isoformat(),
                        diasDeUso=dias_passados,
                        requerGpsFarmacias=False,
                    )
                )

            if (
                med.tipo == MedicationType.CONTINUO
                or med.origemPrescricao == PrescriptionOrigin.ESPECIALIZADO
            ):
                dias_uso = max(0, (ref_date - med.dataInicio).days)
                marco_90 = med.dataInicio + timedelta(days=90)
                atingiu_90_dias = dias_uso >= 90
                generated.append(
                    AutomatedAlertItem(
                        id=f"trimestral-{slug}",
                        profileId=med.profileId,
                        perfilNome=perfil_nome,
                        categoria=AlertCategory.REAVALIACAO_TRIMESTRAL,
                        severidade="critical" if atingiu_90_dias else "info",
                        medicamentoNome=med.nome,
                        medicamentoDosagem=med.dosagem,
                        titulo=(
                            f"🩺 [{perfil_nome}] Reavaliação Trimestral (90 Dias) — {med.nome}"
                            if atingiu_90_dias
                            else f"🗓️ [{perfil_nome}] Marco de 90 Dias ({marco_90.strftime('%d/%m/%Y')}) — {med.nome}"
                        ),
                        mensagem=TRIMESTRAL_REEVALUATION_MESSAGE,
                        dataReferencia=ref_date.isoformat() if atingiu_90_dias else marco_90.isoformat(),
                        diasDeUso=dias_uso,
                        requerGpsFarmacias=False,
                    )
                )

                run_dt = datetime.combine(marco_90, time(hour=9, minute=0))
                if run_dt > datetime.now():
                    try:
                        self.scheduler.add_job(
                            self._heartbeat_dispatch,
                            trigger=DateTrigger(run_date=run_dt),
                            id=f"milestone-90d-{slug}",
                            replace_existing=True,
                        )
                    except Exception:
                        pass

        self.alert_queue = generated
        jobs_count = len(self.scheduler.get_jobs()) if self._started else 0

        return EvaluateAlertsResponse(
            processadoEm=datetime.now(timezone.utc),
            totalAlertas=len(generated),
            jobsAgendados=jobs_count,
            alertas=generated,
        )

    def get_status(self) -> SchedulerStatusResponse:
        self.start()
        jobs = self.scheduler.get_jobs()
        next_runs = [j.next_run_time.isoformat() for j in jobs if getattr(j, "next_run_time", None)]
        next_runs.sort()
        return SchedulerStatusResponse(
            ativo=self.scheduler.running,
            jobsAtivos=len(jobs),
            inscricoesPushWebhook=len(self.subscriptions),
            filaAlertas=self.alert_queue,
            proximoDisparo=next_runs[0] if next_runs else None,
        )

    def generate_ics_calendar(self, medications: list[MedicationCreate]) -> str:
        """Gera arquivo iCalendar (.ics) prefixado com o nome do Perfil (ex: 💊 [Filho] 08:00 - Dipirona 15 gotas)."""
        now_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Meu Cuidado Diario//Motor Multi-Perfil//PT-BR",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:Meu Cuidado Diário — Família",
        ]

        for idx, med in enumerate(medications):
            if not med.ativo:
                continue

            perfil_nome = (med.perfilNome or "Eu").strip()
            dose_label = _format_dose_unit(med.quantidadePorDose, med.unidade.value)

            for horario in med.horarios:
                try:
                    hh, mm = [int(x) for x in horario.split(":")[:2]]
                except Exception:
                    hh, mm = 8, 0
                dt_start = datetime.combine(med.dataInicio, time(hour=hh, minute=mm)).strftime(
                    "%Y%m%dT%H%M%S"
                )
                rrule = (
                    "RRULE:FREQ=DAILY"
                    if med.tipo == MedicationType.CONTINUO or not med.duracaoDias
                    else f"RRULE:FREQ=DAILY;COUNT={med.duracaoDias * max(1, len(med.horarios))}"
                )
                summary_line = f"💊 [{perfil_nome}] {horario} - {med.nome} {dose_label} ({med.dosagem})"
                lines.extend(
                    [
                        "BEGIN:VEVENT",
                        f"UID:dose-p{med.profileId}-{idx}-{horario.replace(':', '')}@meucuidadodiario.local",
                        f"DTSTAMP:{now_str}",
                        f"DTSTART:{dt_start}",
                        rrule,
                        f"SUMMARY:{summary_line}",
                        (
                            f"DESCRIPTION:Paciente: {perfil_nome} | Tomar de {med.intervaloHoras} em {med.intervaloHoras} horas "
                            f"{'durante ' + str(med.duracaoDias) + ' dias' if med.duracaoDias else '(Uso Contínuo)'}."
                        ),
                        "END:VEVENT",
                    ]
                )

            if (
                med.tipo == MedicationType.CONTINUO
                or med.origemPrescricao == PrescriptionOrigin.ESPECIALIZADO
            ):
                marco_90 = med.dataInicio + timedelta(days=90)
                dt_90 = datetime.combine(marco_90, time(hour=9, minute=0)).strftime("%Y%m%dT%H%M%S")
                lines.extend(
                    [
                        "BEGIN:VEVENT",
                        f"UID:reavaliacao-90d-p{med.profileId}-{idx}@meucuidadodiario.local",
                        f"DTSTAMP:{now_str}",
                        f"DTSTART:{dt_90}",
                        "RRULE:FREQ=DAILY;INTERVAL=90",
                        f"SUMMARY:🩺 [{perfil_nome}] Reavaliação 3 Meses (90 dias) — {med.nome}",
                        f"DESCRIPTION:{TRIMESTRAL_REEVALUATION_MESSAGE}",
                        "END:VEVENT",
                    ]
                )

        lines.append("END:VCALENDAR")
        return "\r\n".join(lines)


alert_automator = AlertAutomatorService()
