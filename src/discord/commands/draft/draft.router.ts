import { CommandRoute } from "..";
import { DraftModPickCommand } from "./admin/draft-setdrafted";

export const DraftRoute: CommandRoute = {
  commands: [{ command: DraftModPickCommand, enabled: false }],
  enabled: false,
};
