const blockedPatterns: RegExp[] = [
  /\b(format|diskpart|shutdown|Restart-Computer|Stop-Computer)\b/i,
  /\b(Remove-Item|rmdir|rd)\b.*(-Recurse|\/s)/i,
  /\brm\s+-rf\b/i,
  /\b(del|erase)\s+\/[fq]/i,
  /\b(reg\s+delete|bcdedit|cipher\s+\/w)\b/i,
  /\b(sudo|su\s+-)\b/i
];

export function isCommandBlocked(command: string): boolean {
  return blockedPatterns.some((pattern) => pattern.test(command));
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(github_pat_[A-Za-z0-9_]{20,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s"']+/gi, "$1[REDACTED]");
}