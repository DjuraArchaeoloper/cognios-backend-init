export interface PurchaseInterface {
  _id: string;
  userId: string;
  guideId: string;
  creatorId: string;
  price: number;
  currency: string;
  stripePaymentIntentId: string;
  creatorEarningsAmount: number;
  stripePaymentIntentStatus: any;
  refundedAt?: Date;
  refundableUntil: Date;
  refunded?: boolean;
  refundReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
  pdfAvailable: boolean;
  pdfAccessed?: boolean;
  pdfAccessedAt?: Date;
}
