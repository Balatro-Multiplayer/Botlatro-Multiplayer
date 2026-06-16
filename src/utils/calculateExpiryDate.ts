import { getUserStrikes } from './queryDB'

// Calculate how long a newly-issued strike should last. Expiry scales
// quadratically with the user's total *active* strike count, including the
// strikes being issued right now, so issuing several at once (a major offense)
// is punished much harder than a single strike.
//
//   T (active strikes incl. this issuance):  1    2    3    4
//   expiry (days = 7 * T^2):                 7   28   63  112
export async function calculateExpiryDate(
  user_id: string,
  amount: number,
): Promise<Date> {
  const dayLength = 1000 * 60 * 60 * 24
  const now = Date.now()

  const strikes = await getUserStrikes(user_id)

  // Only non-expired strikes count toward the total. Expired strikes are kept
  // as a permanent record but no longer influence escalation.
  const activeTotalBefore = strikes
    .filter((strike) => new Date(strike.expires_at).getTime() > now)
    .reduce((sum, strike) => sum + strike.amount, 0)

  // Floor at 1 so a degenerate amount of 0 still produces a sane expiry.
  const totalStrikes = Math.max(1, activeTotalBefore + amount)
  const expiryDays = 7 * totalStrikes * totalStrikes

  return new Date(now + dayLength * expiryDays)
}
