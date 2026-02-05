import { z } from "zod";
import { getManagementToken } from "../services/auth0-services/auth0-service";
import { createRoute } from "./route-builder";

export const UserRoute = createRoute()((r) => {
  r.path("settings")((r) => {
    r.get.auth()(async (ctx) => {
      const management = await getManagementToken();
      const user = await management.users.get({ id: ctx.sub });
      const settings =
        (user.data.user_metadata && user.data.user_metadata.settings) || null;
      return settings;
    });
    r.patch.auth().validate({
      body: (data) => z.record(z.any()).parse(data),
    })(async (ctx, req, res) => {
      const management = await getManagementToken();
      await management.users.update(
        { id: ctx.sub },
        { user_metadata: { settings: ctx.validatedBody } },
      );
      res.status(201).json({ settings: ctx.validatedBody });
    });
  });
});
