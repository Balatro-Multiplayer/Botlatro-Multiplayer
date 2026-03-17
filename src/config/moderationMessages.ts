function formatExpiry(expiresAt: Date) {
  return `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`
}

export const moderationMessages = {
  banDm: ({ reason, expiresAt }: { reason: string; expiresAt: Date }) =>
    `You have been banned from Botlatro matchmaking.\nReason: **${reason}**\nBan expires: ${formatExpiry(expiresAt)}`,
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
