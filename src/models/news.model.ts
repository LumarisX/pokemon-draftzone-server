import { Schema, model, Document, Types } from "mongoose";

const newsSchemaFlexible = new Schema(
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
        // Common optional fields for most section types
        subTitle: String,
        description: String,
        pictures: [{ type: String }],

        // Fields specific to 'para' type (though common fields might suffice)
        // paraDescription: String, // Could use 'description'

        // Fields specific to 'bullet' type
        bulletTitle: String,
        bulletDesc: String,

        // Fields specific to 'list' type
        listTitle: String,
        items: [{ type: String }],
        ordered: { type: Boolean, default: false },

        // Fields specific to 'heading' type
        level: { type: Number, min: 1, max: 6 },
        headingText: String, // Could use 'description'

        // Fields specific to 'image' type
        altText: String,
        caption: String,
        imageUrl: String, // Could use 'pictures' with a single element

        // Fields specific to 'code' type
        language: String,
        codeString: String,

        // Add more type-specific fields as needed
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

export const NewsModel = model<NewsDocument>(
  "news_flexible",
  newsSchemaFlexible
);
