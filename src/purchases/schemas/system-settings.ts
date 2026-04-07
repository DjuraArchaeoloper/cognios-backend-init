import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type SystemSettingsDocument = SystemSettings & Document;

@Schema({ timestamps: true })
export class SystemSettings {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: "main",
  })
  key: string;

  @Prop({
    type: Boolean,
    default: false,
  })
  isPurchaseEnabled: boolean;
}

export const SystemSettingsSchema =
  SchemaFactory.createForClass(SystemSettings);
