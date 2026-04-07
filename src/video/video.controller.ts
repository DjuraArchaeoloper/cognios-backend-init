import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { VideoService } from "./video.service";
import { InternalVideoService } from "./internal-video.service";
import { CreateTempVideoDto } from "./dto/create-temp-media.dto";
import { getUserId } from "src/common/helpers/auth";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { VIDEO_PURPOSE } from "./types/types";
import { ServiceToServiceGuard } from "src/common/guards/service.guard";

@Controller("video")
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly internalVideoMediaService: InternalVideoService,
  ) {}

  @Post("tus-upload-url")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalAuthGuard)
  async getTusUploadUrl(
    @Headers("upload-length") uploadLength: string,
    @Headers("upload-metadata") uploadMetadata: string | undefined,
    @Query("purpose") purpose: VIDEO_PURPOSE,
    @Res() res: Response,
  ) {
    if (!Object.values(VIDEO_PURPOSE).includes(purpose)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid purpose",
      });
    }
    if (!uploadLength) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Upload-Length header is required",
      });
    }

    const uploadUrl = await this.videoService.getTusUploadUrl(
      uploadLength,
      purpose,
      uploadMetadata,
    );
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    res.setHeader("Location", uploadUrl);
    res.setHeader("Tus-Resumable", "1.0.0");
    res.setHeader("Upload-Offset", "0");

    res.setHeader("Access-Control-Allow-Origin", frontendUrl);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Location, Tus-Resumable, Upload-Offset, Upload-Length, stream-media-id",
    );

    return res.status(HttpStatus.CREATED).send();
  }

  @Post("create-preview")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async createPreviewVideo(
    @Body()
    body: {
      originalVideoUID: string;
      originalVideoName: string;
    },
  ) {
    try {
      const previewVideo = await this.videoService.createPreviewVideo(
        body.originalVideoUID,
        body.originalVideoName,
      );

      return {
        success: true,
        data: {
          previewVideoUID: previewVideo.uid,
          playbackUrl:
            previewVideo.playback?.hls || previewVideo.playback?.dash,
          readyToStream: previewVideo.readyToStream,
          status: previewVideo.status,
          requireSignedURLs: previewVideo.requireSignedURLs,
          thumbnailId: previewVideo.thumbnail,
        },
        message: "Preview video created successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: error || "Failed to create preview video",
        data: null,
      };
    }
  }

  @Get(":videoUID/status")
  @UseGuards(InternalAuthGuard)
  async getVideoStatus(@Param("videoUID") videoUID: string) {
    const video = await this.videoService.getVideoDetails(videoUID);

    return {
      success: true,
      data: {
        readyToStream: video.readyToStream,
        state: video.status?.state,
        pctComplete: video.status?.pctComplete,
        thumbnailId: video.thumbnail ?? undefined,
      },
    };
  }

  @Post("create-temp")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalAuthGuard)
  async createTempVideo(@Body() dto: CreateTempVideoDto) {
    const media = await this.internalVideoMediaService.createTempVideo(dto);

    return {
      success: true,
      data: {
        mediaId: media._id,
        status: media.status,
      },
      message: "Temp media record created",
    };
  }

  @Post("make-media-orphan")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async makeMediaOrphan(
    @Body() body: { mediaId: { id: string; isMediaId: boolean } },
    @Request() req,
  ) {
    const userId = getUserId(req);
    await this.internalVideoMediaService.makeMediaOrphan(body.mediaId, userId);

    return {
      success: true,
      message: "Media deleted successfully",
    };
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @Post("make-media-published/internal")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceToServiceGuard)
  async makeMediaPublished(
    @Body()
    body: {
      mediaId: string;
      userId: string;
    },
  ) {
    await this.internalVideoMediaService.makeMediaPublished(
      body.mediaId,
      body.userId,
    );

    return {
      success: true,
      message: "Media published successfully",
    };
  }

  @UseGuards(ServiceToServiceGuard)
  @Get(":videoUID/internal")
  @HttpCode(HttpStatus.OK)
  async getVideoDetails(@Param("videoUID") videoUID: string) {
    const video = await this.videoService.getVideoDetails(videoUID);

    return {
      success: true,
      data: video,
    };
  }
}
