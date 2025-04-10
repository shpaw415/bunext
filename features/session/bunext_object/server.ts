import type { Session } from "./types";
import { GetSession, useSession } from "../session";

const SessionInit: Session = {
  hook: {
    useSession,
  },
  get: GetSession,
};

export default SessionInit;
