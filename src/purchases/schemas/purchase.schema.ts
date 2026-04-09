import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";
import { InternalPurchaseStatus } from "./../types/types";

export type PurchaseDocument = Purchase & Document;

@Schema({ timestamps: true })
export class Purchase {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  projectId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  creatorId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  creatorWalletAddress: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  buyerWalletAddress: string;

  @Prop({
    type: String,
    index: true,
  })
  nftMint?: string;

  @Prop({
    type: String,
    index: true,
  })
  metadataUri?: string;

  @Prop({
    type: String,
    enum: InternalPurchaseStatus,
    default: InternalPurchaseStatus.PENDING,
    index: true,
  })
  internalStatus: InternalPurchaseStatus;

  @Prop()
  price?: number;

  @Prop()
  txSignature?: string;

  @Prop({
    type: String,
    index: true,
  })
  mintTxSignature?: string;

  @Prop()
  mintedAt?: Date;

  @Prop()
  mintError?: string;

  @Prop({
    type: Date,
    default: Date.now,
    index: true,
  })
  purchasedAt?: Date;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);

PurchaseSchema.index(
  { userId: 1, projectId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      internalStatus: { $in: ["pending", "completed"] },
    },
  },
);

PurchaseSchema.index({ txSignature: 1 }, { unique: true, sparse: true });
PurchaseSchema.index({ mintTxSignature: 1 }, { unique: true, sparse: true });
PurchaseSchema.index({ nftMint: 1 }, { unique: true, sparse: true });
