import '../register-paths' // This is for docker specifically
import { setupClientCommands } from '../setupCommands'
import { client } from '../client'
import * as dotenv from 'dotenv'

dotenv.config()

async function main() {
  await setupClientCommands(client, true)
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
