import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Document, Model, Types } from "mongoose";
import { Template } from "./template.domain";

@Injectable()
export class TemplateRepository {
  constructor(
    @InjectModel(Template.name)
    private readonly templateModel: Model<Document>,
  ) {}

  async findById(id: string | Types.ObjectId): Promise<Document | null> {
    return this.templateModel.findById(id).exec();
  }
}
