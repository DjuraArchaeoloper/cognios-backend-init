import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ImageService } from "./image.service";
import { InternalImageService } from "./internal-image.service";
import { FileInterceptor } from "@nestjs/platform-express";
import { MulterFile } from "../types/media";
import { UploadImageDto } from "./dto/upload-image.dto";
import { CreateTempImageDto } from "./dto/create-temp-image.dto";
import { getUserId } from "src/common/helpers/auth";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { ServiceToServiceGuard } from "src/common/guards/service.guard";

@Controller("image")
export class ImageController {
  constructor(
    private readonly imageService: ImageService,
    private readonly internalImageService: InternalImageService,
  ) {}

  @Post("upload")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("image"))
  @UseGuards(InternalAuthGuard)
  async uploadImage(
    @UploadedFile() file: MulterFile | undefined,
    @Body() dto: UploadImageDto,
  ) {
    if (!file) throw new BadRequestException("Image is required");

    const result = await this.imageService.uploadImage(
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

  @Post("delete")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async deleteImage(@Body() body: { fileKey: string }) {
    await this.imageService.deleteImage(body.fileKey);

    return {
      success: true,
      message: "Image deleted successfully",
    };
  }

  @Post("create-temp")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalAuthGuard)
  async createTempImage(@Body() dto: CreateTempImageDto) {
    const media = await this.internalImageService.createTempImage(dto);

    return {
      success: true,
      data: {
        mediaId: media._id,
        status: media.status,
      },
      message: "Temp image record created",
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
    await this.internalImageService.makeMediaOrphan(body.mediaId, userId);

    return {
      success: true,
      message: "Image deleted successfully",
    };
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @Post("make-media-published/internal")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceToServiceGuard)
  async makeMediaPublished(@Body() body: { mediaId: string; userId: string }) {
    await this.internalImageService.makeMediaPublished(
      body.mediaId,
      body.userId,
    );

    return {
      success: true,
      message: "Image published successfully",
    };
  }
}
