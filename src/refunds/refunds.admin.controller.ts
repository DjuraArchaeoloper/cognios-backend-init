import { Controller, UseGuards } from "@nestjs/common";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { RefundsService } from "./refunds.service";
import { AdminGuard } from "src/common/guards/admin.guard";

@UseGuards(InternalAuthGuard, AdminGuard)
@Controller("admin/refunds")
export class RefundsAdminController {
  constructor(private readonly refundsService: RefundsService) {}

  // @Post(":refundId/approve")
  // async approveRefund(
  //   @Param("refundId") refundId: string,
  //   @Body()
  //   body: {
  //     userId: string;
  //     projectId: string | undefined;
  //     adminMessage?: string;
  //   },
  // ) {
  //   if (!body.userId || !body.projectId)
  //     throw new BadRequestException("userId and projectId are required");

  //   if (!refundId) throw new BadRequestException("refundId is required");

  //   let adminMessage = body.adminMessage;
  //   if (!adminMessage || adminMessage.trim() === "")
  //     adminMessage = "Your refund request has been approved.";

  //   const result = await this.refundsService.approveRefund(
  //     body.userId,
  //     body.projectId,
  //     refundId,
  //     adminMessage,
  //   );

  //   return {
  //     success: true,
  //     data: result,
  //     message: "Refund approved successfully",
  //   };
  // }
}
