import { CommandRoute } from "..";
import { DraftModPickCommand } from "./admin/draft-modpick";

export const DraftRoute: CommandRoute = {
  commands: [{ command: DraftModPickCommand, enabled: true }],
  enabled: true,
};
