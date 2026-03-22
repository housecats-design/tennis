"use client";

import { resetProgress, saveSchedule } from "@/lib/storage";
import { GenerateScheduleInput, generateScheduleSchema } from "@/lib/validator";
import { Player, ScheduleResponse } from "@/lib/types";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

function readErrorMessage(data: ScheduleResponse | { message?: string }): string {
  return "message" in data && typeof data.message === "string"
    ? data.message
    : "스케줄 생성 중 오류가 발생했습니다.";
}

function getPlayerCountOptions(matchType: "singles" | "doubles"): number[] {
  if (matchType === "doubles") {
    return [4, 6, 8, 10, 12, 14, 16];
  }

  return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

const COURT_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6];
const ROUND_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function createPlayers(count: number, existingPlayers: Player[]): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: existingPlayers[index]?.id ?? crypto.randomUUID(),
    name: existingPlayers[index]?.name ?? "",
  }));
}

export default function HomePage() {
  const router = useRouter();
  const [matchType, setMatchType] = useState<"singles" | "doubles">("singles");
  const [playerCount, setPlayerCount] = useState(4);
  const [courtCount, setCourtCount] = useState(2);
  const [roundCount, setRoundCount] = useState(4);
  const [players, setPlayers] = useState<Player[]>(() => createPlayers(4, []));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setPlayers((currentPlayers) => createPlayers(playerCount, currentPlayers));
  }, [playerCount]);

  const playerCountOptions = useMemo(() => getPlayerCountOptions(matchType), [matchType]);

  const helperText = useMemo(() => {
    if (matchType === "doubles") {
      return "복식은 4명 이상, 짝수 인원이어야 합니다.";
    }

    return "단식은 2명 이상이면 생성할 수 있습니다.";
  }, [matchType]);

  function updatePlayerName(index: number, name: string): void {
    setPlayers((currentPlayers) =>
      currentPlayers.map((player, currentIndex) =>
        currentIndex === index ? { ...player, name } : player,
      ),
    );
  }

  function normalizePlayerCount(nextCount: number, nextMatchType: "singles" | "doubles"): number {
    const minimum = nextMatchType === "doubles" ? 4 : 2;
    let normalized = Math.max(minimum, nextCount);

    if (nextMatchType === "doubles" && normalized % 2 !== 0) {
      normalized += 1;
    }

    return normalized;
  }

  function handleMatchTypeChange(nextMatchType: "singles" | "doubles"): void {
    setMatchType(nextMatchType);
    const nextOptions = getPlayerCountOptions(nextMatchType);
    setPlayerCount((currentCount) => {
      const normalized = normalizePlayerCount(currentCount, nextMatchType);
      return nextOptions.includes(normalized) ? normalized : nextOptions[0];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload: GenerateScheduleInput = {
      matchType,
      courtCount,
      roundCount,
      players,
    };

    const parsed = generateScheduleSchema.safeParse(payload);
    if (!parsed.success) {
      const message =
        parsed.error.errors[0]?.message ?? "입력값을 다시 확인해 주세요.";
      setError(message);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as ScheduleResponse | { message?: string };

      if (!response.ok) {
        setError(readErrorMessage(data));
        return;
      }

      const schedule = data as ScheduleResponse;

      const storedSchedule = {
        input: parsed.data,
        output: schedule,
      };

      saveSchedule(storedSchedule);
      resetProgress();

      router.push("/result");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="mb-8">
        <p className="mb-3 inline-flex rounded-full border border-line bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-accentStrong">
          Tennis Match Scheduler
        </p>
        <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
          공정한 테니스 경기표를 빠르게 생성하는 MVP
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/75 sm:text-base">
          단식과 복식 모두 지원합니다. 선수 수, 코트 수, 라운드 수를 입력하면 라운드별 대진,
          휴식 인원, 선수별 통계를 한 번에 확인할 수 있습니다.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"
      >
        <div className="rounded-3xl border border-line bg-white/90 p-6 shadow-panel">
          <div className="grid gap-6">
            <div>
              <p className="mb-3 text-sm font-semibold text-ink/70">경기 유형</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["singles", "doubles"] as const).map((option) => {
                  const selected = matchType === option;
                  return (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${
                        selected
                          ? "border-accent bg-accentStrong text-white"
                          : "border-line bg-surface text-ink"
                      }`}
                    >
                      <input
                        type="radio"
                        name="matchType"
                        value={option}
                        className="sr-only"
                        checked={selected}
                        onChange={() => handleMatchTypeChange(option)}
                      />
                      <div className="text-lg font-bold">
                        {option === "singles" ? "Singles" : "Doubles"}
                      </div>
                      <div className={`mt-1 text-sm ${selected ? "text-white/80" : "text-ink/70"}`}>
                        {option === "singles" ? "1 vs 1" : "2 vs 2"}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold">
                선수 수
                <select
                  value={playerCount}
                  onChange={(event) => setPlayerCount(Number(event.target.value))}
                  className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-accent"
                >
                  {playerCountOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}명
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                코트 수
                <select
                  value={courtCount}
                  onChange={(event) => setCourtCount(Number(event.target.value))}
                  className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-accent"
                >
                  {COURT_COUNT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}개
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                라운드 수
                <select
                  value={roundCount}
                  onChange={(event) => setRoundCount(Number(event.target.value))}
                  className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-accent"
                >
                  {ROUND_COUNT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}라운드
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink/70">선수 이름</p>
                <p className="text-xs text-ink/55">{helperText}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {players.map((player, index) => (
                  <label key={player.id} className="grid gap-2 text-sm font-semibold">
                    Player {index + 1}
                    <input
                      type="text"
                      value={player.name}
                      onChange={(event) => updatePlayerName(index, event.target.value)}
                      placeholder={`선수 ${index + 1}`}
                      className="rounded-2xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-accent"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-line bg-accentStrong p-6 text-white shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
            Generate
          </p>
          <h2 className="mt-3 text-2xl font-black">입력값을 검증한 뒤 대진을 생성합니다.</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-white/80">
            <li>공정성 기준: 적게 뛴 선수 우선</li>
            <li>휴식 균형: 많이 쉰 선수 우선 배정</li>
            <li>결과 화면에서 라운드와 선수 통계 동시 확인</li>
          </ul>

          {error ? (
            <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-accentStrong transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "생성 중..." : "경기표 생성"}
          </button>
        </aside>
      </form>
    </main>
  );
}
