import { z } from "zod";
import { PDBLDoc, PDBLModel } from "../models/pdbl.model";

export namespace BattleZone {
  class SignUp {
    name: string;
    teamName: string;
    timezone: string;
    experience: string;
    droppedBefore: boolean;
    droppedWhy: string;
    confirm: boolean;
    sub: string;

    constructor(
      name: string,
      teamName: string,
      timezone: string,
      experience: string,
      droppedBefore: boolean,
      droppedWhy: string,
      confirm: boolean,
      sub: string,
    ) {
      this.name = name;
      this.teamName = teamName;
      this.timezone = timezone;
      this.experience = experience;
      this.droppedBefore = droppedBefore;
      this.droppedWhy = droppedWhy;
      this.confirm = confirm;
      this.sub = sub;
    }

    toDocument() {
      const doc: PDBLDoc = {
        name: this.name,
        timezone: this.timezone,
        dropped: this.droppedBefore ? this.droppedWhy : null,
        experience: this.experience,
        confirm: this.confirm,
        sub: this.sub,
      };
      return new PDBLModel(doc);
    }
  }

  const signUpSchema = z
    .object({
      discordName: z
        .string()
        .trim()
        .min(1, "Invalid discordName: Must be a non-empty string."),
      teamName: z
        .string()
        .trim()
        .min(1, "Invalid teamName: Must be a non-empty string."),
      timezone: z
        .string()
        .trim()
        .min(1, "Invalid timezone: Must be a non-empty string."),
      experience: z.string({
        required_error: "Invalid experience: Must be a string.",
        invalid_type_error: "Invalid experience: Must be a string.",
      }),
      droppedBefore: z.boolean({
        required_error: "Invalid droppedBefore: Must be a boolean.",
        invalid_type_error: "Invalid droppedBefore: Must be a boolean.",
      }),
      droppedWhy: z.string({
        required_error:
          "Invalid droppedWhy: Must be a non-empty string if droppedBefore is true.",
        invalid_type_error:
          "Invalid droppedWhy: Must be a non-empty string if droppedBefore is true.",
      }),
      confirm: z.boolean({
        required_error: "Invalid confirm: Must be true.",
        invalid_type_error: "Invalid confirm: Must be true.",
      }),
    })
    .superRefine((value, ctx) => {
      if (value.droppedBefore && value.droppedWhy.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["droppedWhy"],
          message:
            "Invalid droppedWhy: Must be a non-empty string if droppedBefore is true.",
        });
      }
      if (!value.confirm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirm"],
          message: "Invalid confirm: Must be true.",
        });
      }
    });

  export function validateSignUpForm(data: unknown, sub: string): SignUp {
    const parsed = signUpSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(issue?.message ?? "Invalid data: Expected an object.");
    }

    const {
      discordName,
      teamName,
      timezone,
      experience,
      droppedBefore,
      droppedWhy,
      confirm,
    } = parsed.data;

    return new SignUp(
      discordName,
      teamName,
      timezone,
      experience,
      droppedBefore,
      droppedWhy,
      confirm,
      sub,
    );
  }
}
