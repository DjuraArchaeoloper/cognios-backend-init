export enum InternalPurchaseStatus {
  PENDING = "pending",
  PAID = "completed",
  MINT_FAILED = "mint_failed",
}

export enum MarketplaceListingStatus {
  PENDING_LIST = "pending_list",
  ACTIVE = "active",
  PENDING_DELIST = "pending_delist",
  DELISTED = "delisted",
  PENDING_BUY = "pending_buy",
  SOLD = "sold",
}

export interface PurchaseInterface {
  _id: string;
  userId: string;
  projectId: string;
  creatorId: string;
  price: number;
  creatorWalletAddress: string;
  buyerWalletAddress: string;
  nftMint?: string;
  metadataUri?: string;
  internalStatus: InternalPurchaseStatus;
  txSignature?: string;
  mintTxSignature?: string;
  mintedAt?: Date;
  mintError?: string;
}

export interface MarketplaceListingInterface {
  _id: string;
  listingId: string;
  listingPda: string;
  mint: string;
  projectId: string;
  projectPubkey: string;
  sellerId: string;
  sellerWalletAddress: string;
  buyerId?: string;
  buyerWalletAddress?: string;
  priceLamports: number;
  expiryTs: number;
  status: MarketplaceListingStatus;
  listTxSignature?: string;
  delistTxSignature?: string;
  buyTxSignature?: string;
  listedAt?: Date;
  delistedAt?: Date;
  soldAt?: Date;
}

export interface UserPurchasesResponse {
  title: string;
  slug: string;
  thumbnailId: string;
  creatorName: string;
}

export interface CreatorEarningsResponse {
  creatorEarnings: CreatorEarnings[];
  totalSales: number;
  totalEarnings: number;
  totalPrice: number;
}

export interface CreatorEarnings {
  _id: string;
  creatorId: string;
  earnings: number;
  price: number;
  projectTitle: string;
  projectSlug: string;
  projectCurrency: string;
  internalStatus: string;
  createdAt: Date | null;
}

export interface UserPaymentsResponse {
  userPayments: UserPayments[];
  totalPayments: number;
}

export interface UserPayments {
  _id: string;
  price: number;
  projectTitle: string;
  projectSlug: string;
  projectCurrency: string;
  internalStatus: string;
  createdAt: Date | null;
}
