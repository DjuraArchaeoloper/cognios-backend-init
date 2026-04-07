import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type SavedGuideDocument = SavedGuide & Document;

@Schema({ timestamps: true })
export class SavedGuide {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  guideId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;
}

export const SavedGuideSchema = SchemaFactory.createForClass(SavedGuide);

SavedGuideSchema.index({ guideId: 1, userId: 1 }, { unique: true });
