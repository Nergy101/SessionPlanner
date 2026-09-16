import { createDefine } from "fresh";

export interface State {
  /** Set by the auth middleware once the password cookie checks out. */
  signedIn: boolean;
}

export const define = createDefine<State>();
