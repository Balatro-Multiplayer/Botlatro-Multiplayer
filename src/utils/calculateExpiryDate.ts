import { getUserStrikes } from './queryDB'

// for calculating how long the expiry should be on a strike, based on a few crude methods
export async function calculateExpiryDate(
  user_id: string,
): Promise<Date | null> {
  const dayLength = 1000 * 60 * 60 * 24
  const currentDate = new Date()
  const res = await getUserStrikes(user_id)
  let lengthOfBan: number = 14 // default strike expiry timer

  const strikes = res.map((strike: any) => {
    const currentDate = new Date()
    const expired: boolean = strike.expiryDate >= currentDate
    return { amount: strike.amount, expired: expired }
  })

  const totalStrikes = strikes.reduce((sum, strike) => {
    return sum + strike.amount
  }, 0)

  const hasHadSevereStrike: boolean[] = strikes.map((strike) => {
    // checks if a user has ever had a more serious incident
    return strike.amount >= 1
  })

  lengthOfBan += totalStrikes * 7
  lengthOfBan += hasHadSevereStrike.length * 14

  return new Date(currentDate.getTime() + dayLength * lengthOfBan)
}
