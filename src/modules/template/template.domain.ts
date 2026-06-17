import { TemplateDto } from "./template.dto";
import { Document } from "mongoose";

export class Template {
  constructor() {}

  public toDatabasePayload() {
    return {};
  }

  public toClientPayload() {
    return {};
  }

  public static fromForm(dto: TemplateDto): Template {
    return new Template();
  }

  public static fromDatabase(doc: Document): Template {
    return new Template();
  }
}
