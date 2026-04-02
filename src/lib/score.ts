export function isCompletedMatchScore(scoreA: number | null | undefined, scoreB: number | null | undefined): boolean {
  return Number.isInteger(scoreA) && Number.isInteger(scoreB);
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

// 최고 점수가 6이면 바로 반영하고,
// 그 외 점수는 사용자가 버튼 근처에서 한 번 더 확인한 뒤 저장합니다.
export function shouldConfirmScoreBeforeSave(scoreA: number, scoreB: number): boolean {
  return Math.max(scoreA, scoreB) !== 6;
}
