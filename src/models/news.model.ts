import { Schema, model, Document, Types } from "mongoose";

const buttonSchema = new Schema(
  {
    text: { type: String, required: true },
    disabled: { type: Boolean, default: false },
    link: { type: String, required: true },
    newWindow: { type: Boolean, default: false },
  },
  { _id: false }
);

const imageSchema = new Schema(
  {
    title: String,
    imageUrl: { type: String, required: true },
    size: { type: String, enum: ["small", "medium", "large"] },
  },
  { _id: false }
);

const newsSchema = new Schema(
  {
    title: { type: String, required: true },
    sections: [
      new Schema(
        {
          type: {
            type: String,
            enum: ["para", "buttons", "images", "heading", "list", "markdown"],
            required: true,
          },

          // --- Fields specific to 'para' ---
          description: String,

          // --- Fields specific to 'list' ---
          listTitle: String,
          items: [String],
          ordered: { type: Boolean, default: false },

          // --- Fields specific to 'heading' ---
          headingText: String,
          level: { type: Number, min: 1, max: 6 },
          buttons: [buttonSchema],

          images: [imageSchema],
        },
        { _id: false }
      ),
    ],
  },
  {
    timestamps: true,
  }
);

export type Section =
  | {
      type: "para";
      description: string;
    }
  | {
      type: "markdown";
      description: string;
    }
  | {
      type: "list";
      listTitle?: string;
      items: string[];
      ordered?: boolean;
    }
  | {
      type: "heading";
      headingText: string;
    }
  | {
      type: "buttons";
      buttons: {
        text: string;
        disabled?: boolean;
        link: string;
        newWindow?: boolean;
      }[];
    }
  | {
      type: "images";
      images: {
        title?: string;
        imageUrl: string;
        size?: "small" | "medium" | "large";
      }[];
    };

export type News = {
  _id: Types.ObjectId;
  title: string;
  sections: Section[];
  createdAt: Date;
  updatedAt: Date;
};

export type NewsDocument = News & Document;

export const NewsModel = model<NewsDocument>("news", newsSchema);
