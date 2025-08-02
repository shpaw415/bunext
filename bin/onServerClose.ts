import { ExitCodeDescription } from "./exit-codes"
import { handleDev } from "./servers"




export const OnServerClose: Record<number, (proc: Bun.SyncSubprocess<"inherit", "inherit">) => void | Promise<void>> = {
    [ExitCodeDescription[3].code]: () => handleDev()
}