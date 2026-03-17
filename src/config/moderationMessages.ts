function formatExpiry(expiresAt: Date | null) {
  if (!expiresAt) return 'Never (permanent)'
  return `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`
}

export const moderationMessages = {
  banDm: ({ reason, expiresAt }: { reason: string; expiresAt: Date | null }) =>
    `You have been banned from Botlatro matchmaking.\nReason: **${reason}**\nBan expires: ${formatExpiry(expiresAt)}`,
  banUpdatedDm: ({
    reason,
    expiresAt,
  }: {
    reason: string
    expiresAt: Date | null
  }) =>
    `Your Botlatro matchmaking ban has been updated.\nReason: **${reason}**\nBan expires: ${formatExpiry(expiresAt)}`,
  banLiftedDm: ({
    reason,
    expired = false,
  }: {
    reason?: string | null
    expired?: boolean
  }) =>
    `Your Botlatro matchmaking ban has been lifted.${expired ? '\nYour ban expired.' : ''}${reason?.trim() ? `\nReason: **${reason.trim()}**` : ''}`,
  strikeDm: ({
    amount,
    reason,
    totalStrikes,
  }: {
    amount: number
    reason: string
    totalStrikes: number
  }) =>
    `You have received **${amount}** strike(s) for: **${reason}**\nYour total strikes: **${totalStrikes}**`,
}
