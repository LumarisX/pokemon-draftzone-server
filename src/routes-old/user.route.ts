import { z } from "zod";
import { getManagementToken } from "../services/auth0-services/auth0-service";
import { createRoute } from "./route-builder";

export const UserRoute = createRoute()((r) => {
  r.path("settings")((r) => {
    r.get.auth()(async (ctx) => {
      const management = await getManagementToken();
      const user = await management.users.get(ctx.sub);
      return user.user_metadata?.settings ?? null;
    });
    r.patch.auth().validate({
      body: (data) => z.record(z.string(), z.any()).parse(data),
    })(async (ctx, req, res) => {
      const management = await getManagementToken();
      await management.users.update(ctx.sub, {
        user_metadata: { settings: ctx.validatedBody },
      });
      res.status(201).json({ settings: ctx.validatedBody });
    });
  });
});
