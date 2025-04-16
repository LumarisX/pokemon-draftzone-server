import { Schema, model, Document, Types } from "mongoose";

const newsSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    pictures: [{ type: String }],
    sections: [
      {
        type: {
          type: String,
          enum: ["para", "bullet", "image", "heading", "list", "code"],
          required: true,
        },
        subTitle: String,
        description: String,
        pictures: [{ type: String }],
        bulletTitle: String,
        bulletDesc: String,
        listTitle: String,
        items: [{ type: String }],
        ordered: { type: Boolean, default: false },
        level: { type: Number, min: 1, max: 6 },
        headingText: String,
        altText: String,
        caption: String,
        imageUrl: String,
        language: String,
        codeString: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export type Section =
  | {
      type: "para";
      subTitle?: string;
      description?: string;
      pictures?: string[];
    }
  | { type: "bullet"; bulletTitle: string; bulletDesc: string }
  | { type: "list"; listTitle?: string; items: string[]; ordered?: boolean }
  | { type: "heading"; level: number; headingText: string }
  | { type: "image"; altText?: string; caption?: string; imageUrl: string }
  | { type: "code"; language?: string; codeString: string }
  | Record<string, any>;

export type News = {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  pictures?: string[];
  sections: Section[];
  createdAt: Date;
  updatedAt: Date;
};

export type NewsDocument = News & Document;

export const NewsModel = model<NewsDocument>("news", newsSchema);
