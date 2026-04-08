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
import { FileInterceptor } from "@nestjs/platform-express";
import { MulterFile } from "../types/media";
import { UploadImageDto } from "./dto/upload-image.dto";
import { InternalAuthGuard } from "src/common/guards/auth.guard";

@Controller("image")
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

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
}
