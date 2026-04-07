export enum InternalPurchaseStatus {
  PENDING = "pending",
  PAID = "paid",
  EXPIRED = "expired",
  REFUNDED = "refunded",
}
export interface PurchaseInterface {
  _id: string;
  userId: string;
  guideId: string;
  creatorId: string;
  price: number;
  currency: string;
  creatorEarningsAmount: number;
  internalStatus: InternalPurchaseStatus;
  refundedAt?: Date;
  refundableUntil: Date;
  refunded?: boolean;
  refundReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
  pdfAvailable: boolean;
  pdfAccessed?: boolean;
  pdfAccessedAt?: Date;
  videoPlaybackInitiatedAt?: Date;
  videoPlaybackUrl?: string;
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
  guideTitle: string;
  guideSlug: string;
  guideCurrency: string;
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
  guideTitle: string;
  guideSlug: string;
  guideCurrency: string;
  internalStatus: string;
  createdAt: Date | null;
}

export interface GuidesEligibleForRefundResponse {
  _id: string;
  title: string;
  purchaseId: string;
}
