import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";
import { MarketplaceListingStatus } from "../types/types";

export type MarketplaceListingDocument = MarketplaceListing & Document;

@Schema({ timestamps: true })
export class MarketplaceListing {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  listingId: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  listingPda: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  mint: string;

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
  sellerId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  sellerWalletAddress: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    index: true,
  })
  buyerId?: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    index: true,
  })
  buyerWalletAddress?: string;

  @Prop({
    type: Number,
    required: true,
    index: true,
  })
  priceLamports: number;

  @Prop({
    type: Number,
    default: 0,
  })
  expiryTs: number;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  projectPubkey: string;

  @Prop({
    type: String,
    enum: MarketplaceListingStatus,
    default: MarketplaceListingStatus.PENDING_LIST,
    index: true,
  })
  status: MarketplaceListingStatus;

  @Prop()
  listTxSignature?: string;

  @Prop()
  delistTxSignature?: string;

  @Prop()
  buyTxSignature?: string;

  @Prop({
    type: Date,
    index: true,
  })
  listedAt?: Date;

  @Prop()
  delistedAt?: Date;

  @Prop()
  soldAt?: Date;
}

export const MarketplaceListingSchema =
  SchemaFactory.createForClass(MarketplaceListing);

MarketplaceListingSchema.index(
  { mint: 1, sellerWalletAddress: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["active"] },
    },
  },
);
MarketplaceListingSchema.index(
  { listTxSignature: 1 },
  { unique: true, sparse: true },
);
MarketplaceListingSchema.index(
  { delistTxSignature: 1 },
  { unique: true, sparse: true },
);
MarketplaceListingSchema.index(
  { buyTxSignature: 1 },
  { unique: true, sparse: true },
);
