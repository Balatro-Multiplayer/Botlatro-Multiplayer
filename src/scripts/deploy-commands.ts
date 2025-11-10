import '../register-paths' // This is for docker specifically
import { setupClientCommands } from '../setupCommands'
import { client } from '../client'
import * as dotenv from 'dotenv'

dotenv.config()
setupClientCommands(client, true)
