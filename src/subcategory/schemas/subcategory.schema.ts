import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type SubcategoryDocument = Subcategory & Document;

@Schema({ timestamps: true })
export class Subcategory {
  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  slug: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Category",
    required: true,
    index: true,
  })
  categoryId: MongooseSchema.Types.ObjectId;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive?: boolean;
}

export const SubcategorySchema = SchemaFactory.createForClass(Subcategory);
