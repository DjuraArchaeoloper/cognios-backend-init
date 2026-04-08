export enum InternalPurchaseStatus {
  PENDING = "pending",
  PAID = "completed",
  MINT_FAILED = "mint_failed",
}
export interface PurchaseInterface {
  _id: string;
  userId: string;
  projectId: string;
  creatorId: string;
  price: number;
  creatorWalletAddress: string;
  buyerWalletAddress: string;
  nftMint: string;
  internalStatus: InternalPurchaseStatus;
  txSignature?: string;
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

export interface ProjectsEligibleForRefundResponse {
  _id: string;
  title: string;
  purchaseId: string;
}
