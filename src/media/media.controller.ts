import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { MediaService } from "./media.service";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { MulterFile, VIDEO_PURPOSE } from "./types/types";
import type { Response } from "express";
import { UploadImageDto } from "./dto/upload-image.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadFileDto } from "./dto/upload-file.dto";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // FILE
  @Post("file/upload")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(InternalAuthGuard)
  async uploadFile(
    @UploadedFile() file: MulterFile | undefined,
    @Body() dto: UploadFileDto,
  ) {
    if (!file) throw new BadRequestException("File is required");

    const result = await this.mediaService.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      {
        folder: dto.folder || "files",
        maxSize: dto.maxSize,
      },
    );

    return {
      success: true,
      data: {
        fileKey: result.fileKey,
        fileName: result.fileName,
        fileSize: result.fileSize,
        mimeType: result.mimeType,
      },
      message: "File uploaded successfully",
    };
  }

  @Post("file/delete")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async deleteFile(@Body() body: { fileKey: string }) {
    await this.mediaService.deleteFile(body.fileKey);
    return {
      success: true,
      message: "File deleted successfully",
    };
  }

  // IMAGE
  @Post("image/upload")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("image"))
  @UseGuards(InternalAuthGuard)
  async uploadImage(
    @UploadedFile() file: MulterFile | undefined,
    @Body() dto: UploadImageDto,
  ) {
    console.log(dto);
    if (!file) throw new BadRequestException("Image is required");

    const result = await this.mediaService.uploadImage(
      file.buffer,
      file.mimetype,
      {
        folder: dto.folder || "images",
        maxWidth: dto.maxWidth,
        maxHeight: dto.maxHeight,
        quality: dto.quality,
        format: dto.format,
      },
    );

    return {
      success: true,
      data: {
        url: result.url,
        fileKey: result.fileKey,
        width: result.width,
        height: result.height,
        size: result.size,
        fileId: result.fileId,
      },
      message: "Image uploaded successfully",
    };
  }

  @Post("image/delete")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async deleteImage(@Body() body: { fileKey: string }) {
    await this.mediaService.deleteImage(body.fileKey);

    return {
      success: true,
      message: "Image deleted successfully",
    };
  }

  // VIDEO
  @Post("video/tus-upload-url")
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

    const uploadUrl = await this.mediaService.getTusUploadUrl(
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

  @Post("video/create-preview")
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
      const previewVideo = await this.mediaService.createPreviewVideo(
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

  @Get("video/:videoUID/status")
  @UseGuards(InternalAuthGuard)
  async getVideoStatus(@Param("videoUID") videoUID: string) {
    const video = await this.mediaService.getVideoDetails(videoUID);

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

  @Get("video/:videoUID/internal")
  @HttpCode(HttpStatus.OK)
  async getVideoDetails(@Param("videoUID") videoUID: string) {
    const video = await this.mediaService.getVideoDetails(videoUID);

    return {
      success: true,
      data: video,
    };
  }

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
