import { getUserStrikes } from './queryDB'

// for calculating how long the expiry should be on a strike, based on a few crude methods
export async function calculateExpiryDate(
  user_id: string,
): Promise<Date | null> {
  const dayLength = 1000 * 60 * 60 * 24
  const currentDate = new Date()
  const res = await getUserStrikes(user_id)
  let lengthOfBan: number = 14 // default strike expiry timer

  const strikes = res.map((strike) => {
    const currentDate = new Date()
    const expired: boolean = strike.expires_at >= currentDate
    return { amount: strike.amount, expired: expired }
  })

  const totalStrikes = strikes.reduce((sum, strike) => {
    return sum + strike.amount
  }, 0)

  const severeStrikes = strikes.filter((strike) => {
    // checks if a user has ever had a more serious incident
    return strike.amount >= 1
  })

  lengthOfBan += totalStrikes * 7
  lengthOfBan += severeStrikes.length * 14

  return new Date(currentDate.getTime() + dayLength * lengthOfBan)
}
