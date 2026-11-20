import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";

export const ADMIN_AUDIT_ACTIONS = [
  "user.reset-display-name",
  "account.lock",
  "account.unlock",
  "account.transfer",
  "account.transfer-undo",
  "account.merge",
  "account.merge-undo",
  "account.delete",
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export type AdminAuditDocument = HydratedDocument<AdminAuditEntity>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: "adminaudits",
})
export class AdminAuditEntity {
  @Prop({ type: String, required: true })
  actor!: string;

  @Prop({ type: String, enum: ADMIN_AUDIT_ACTIONS, required: true })
  action!: AdminAuditAction;

  @Prop({ type: String, required: true })
  target!: string;

  @Prop({ type: SchemaTypes.Mixed })
  details?: Record<string, unknown>;

  createdAt?: Date;
}

export const AdminAuditSchema = SchemaFactory.createForClass(AdminAuditEntity);

AdminAuditSchema.index({ target: 1, createdAt: -1 });
AdminAuditSchema.index({ actor: 1, createdAt: -1 });
