import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { MediaService } from "./media.service";
import { ServiceToServiceGuard } from "src/common/guards/service.guard";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @UseGuards(ServiceToServiceGuard)
  @Post("access-token/internal")
  @HttpCode(HttpStatus.OK)
  async generateAccessToken(
    @Body() dto: { videoUid: string; expiration?: number },
  ) {
    if (!dto.videoUid) throw new BadRequestException("videoUid is required");

    try {
      const videoToken = await this.mediaService.generateTokenForStreamVideos(
        dto.videoUid,
        dto.expiration ?? 3600, // 1 hour expiration default
      );

      return {
        success: true,
        data: {
          videoToken,
        },
        message: "Access tokens generated successfully",
      };
    } catch {
      throw new BadRequestException("Failed to generate access tokens");
    }
  }

  @UseGuards(ServiceToServiceGuard)
  @Post("access-pdf/internal")
  @HttpCode(HttpStatus.OK)
  async generateSignedPdfUrl(
    @Body() dto: { pdfKey: string; expiration?: number },
  ) {
    if (!dto.pdfKey) throw new BadRequestException("pdfKey is required");

    const signedPdfUrl = await this.mediaService.generateSignedUrl(
      dto.pdfKey,
      dto.expiration ?? 600, // 10 minutes expiration default
    );

    if (!signedPdfUrl)
      return {
        success: false,
        data: {
          hasAccess: false,
          signedPdfUrl: "",
        },
        message: "Failed to generate signed PDF URL",
      };

    return {
      success: true,
      data: {
        hasAccess: true,
        signedPdfUrl,
      },
      message: "Signed PDF URL generated successfully",
    };
  }
}
