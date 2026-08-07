export function formatKSH(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return 'KSh 0';
  }
  return `KSh ${Math.round(amount).toLocaleString('en-KE')}`;
}
