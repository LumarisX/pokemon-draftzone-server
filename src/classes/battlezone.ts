import { PDBLDoc, PDBLModel } from "../models/pdbl.model";

export namespace BattleZone {
  class SignUp {
    name: string;
    timezone: string;
    experience: string;
    droppedBefore: boolean;
    droppedWhy: string;
    confirm: boolean;
    sub: string;

    constructor(
      name: string,
      timezone: string,
      experience: string,
      droppedBefore: boolean,
      droppedWhy: string,
      confirm: boolean,
      sub: string
    ) {
      this.name = name;
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

  export function validateSignUpForm(data: unknown, sub: string): SignUp {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid data: Expected an object.");
    }
    const {
      discordName,
      timezone,
      experience,
      droppedBefore,
      droppedWhy,
      confirm,
    } = data as { [key: string]: unknown };
    if (typeof discordName !== "string" || discordName.trim() === "")
      throw new Error("Invalid discordName: Must be a non-empty string.");
    if (typeof timezone !== "string" || timezone.trim() === "")
      throw new Error("Invalid timezone: Must be a non-empty string.");
    if (typeof experience !== "string")
      throw new Error("Invalid experience: Must be a string.");
    if (typeof droppedBefore !== "boolean")
      throw new Error("Invalid droppedBefore: Must be a boolean.");
    if (
      typeof droppedWhy !== "string" ||
      (droppedBefore && droppedWhy.trim() === "")
    )
      throw new Error(
        "Invalid droppedWhy: Must be a non-empty string if droppedBefore is true."
      );
    if (typeof confirm !== "boolean" || !confirm)
      throw new Error("Invalid confirm: Must be true.");

    return new SignUp(
      discordName,
      timezone,
      experience,
      droppedBefore,
      droppedWhy,
      confirm,
      sub
    );
  }
}
