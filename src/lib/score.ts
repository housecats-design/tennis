export function isCompletedMatchScore(scoreA: number | null | undefined, scoreB: number | null | undefined): boolean {
  return (
    (scoreA === 6 && typeof scoreB === "number" && scoreB >= 0 && scoreB <= 5) ||
    (scoreB === 6 && typeof scoreA === "number" && scoreA >= 0 && scoreA <= 5)
  );
}

export function validateScoreInput(scoreA: number, scoreB: number): string | null {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return "점수는 정수여야 합니다.";
  }

  if (scoreA < 0 || scoreB < 0) {
    return "점수는 0 이상이어야 합니다.";
  }

  return null;
}

// 한 팀이 정확히 6점인 정상 종료 점수만 바로 저장하고,
// 그 외 점수는 사용자가 한 번 더 확인한 뒤 저장합니다.
export function shouldConfirmScoreBeforeSave(scoreA: number, scoreB: number): boolean {
  return !isCompletedMatchScore(scoreA, scoreB);
}
