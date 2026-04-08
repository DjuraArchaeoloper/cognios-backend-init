export interface PurchaseInterface {
  _id: string;
  userId: string;
  projectId: string;
  creatorId: string;
  price: number;
  currency: string;
  creatorEarningsAmount: number;
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
