import { Controller, UseGuards } from "@nestjs/common";
import { RefundsService } from "./refunds.service";
import { InternalAuthGuard } from "src/common/guards/auth.guard";

@UseGuards(InternalAuthGuard)
@Controller("billing/refunds")
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}
}
