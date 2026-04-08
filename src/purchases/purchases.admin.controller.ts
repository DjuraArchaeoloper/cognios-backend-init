import { Controller } from "@nestjs/common";
import { PurchasesService } from "./purchases.service";

@Controller("admin/purchases")
export class PurchasesAdminController {
  constructor(private readonly purchasesService: PurchasesService) {}

  // @UseGuards(InternalAuthGuard, AdminGuard)
  // @Put("toggle-purchase")
  // async togglePurchase(
  //   @Body()
  //   body: {
  //     isPurchaseEnabled: boolean;
  //   },
  // ) {
  //   const result = await this.purchasesService.togglePurchase(
  //     body.isPurchaseEnabled,
  //   );

  //   return {
  //     success: true,
  //     data: result,
  //     message: "Purchase is enabled/disabled successfully",
  //   };
  // }
}
