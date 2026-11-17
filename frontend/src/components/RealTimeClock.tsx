import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function RealTimeClock() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formattedTime = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const formattedDate = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-emerald-900/10 bg-emerald-950 px-3.5 py-2 text-white shadow-sm sm:px-4 sm:py-2.5"
      aria-label="Relógio digital em tempo real"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300">
        <Clock size={18} />
      </span>
      <div className="leading-tight">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-base font-bold tracking-wider text-emerald-300 sm:text-lg"
            data-testid="realtime-clock-time"
          >
            {formattedTime}
          </span>
          <span className="hidden rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 sm:inline-block">
            Tempo Real
          </span>
        </div>
        <p
          className="text-[11px] capitalize text-emerald-100/85 sm:text-xs"
          data-testid="realtime-clock-date"
        >
          {formattedDate}
        </p>
      </div>
    </div>
  );
}
