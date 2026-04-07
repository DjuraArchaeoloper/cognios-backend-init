import {
  Controller,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  Body,
  BadRequestException,
  UseGuards,
  Request,
} from "@nestjs/common";
import { FileService } from "./file.service";
import { InternalFileService } from "./internal-file.service";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadFileDto } from "./dto/upload-file.dto";
import { CreateTempFileDto } from "./dto/create-temp-file.dto";
import { MulterFile } from "../types/media";
import { getUserId } from "src/common/helpers/auth";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { ServiceToServiceGuard } from "src/common/guards/service.guard";

@Controller("file")
export class FileController {
  constructor(
    private readonly fileService: FileService,
    private readonly fileMediaService: InternalFileService,
  ) {}

  @Post("upload")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @UseGuards(InternalAuthGuard)
  async uploadFile(
    @UploadedFile() file: MulterFile | undefined,
    @Body() dto: UploadFileDto,
  ) {
    if (!file) throw new BadRequestException("File is required");

    const result = await this.fileService.uploadFile(
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

  @Post("files/delete")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async deleteFile(@Body() body: { fileKey: string }) {
    await this.fileService.deleteFile(body.fileKey);
    return {
      success: true,
      message: "File deleted successfully",
    };
  }

  @Post("create-temp")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalAuthGuard)
  async createTempFile(@Body() dto: CreateTempFileDto) {
    const media = await this.fileMediaService.createTempFile(dto);

    return {
      success: true,
      data: {
        mediaId: media._id,
        status: media.status,
      },
      message: "Temp file record created",
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
    await this.fileMediaService.makeMediaOrphan(body.mediaId, userId);

    return {
      success: true,
      message: "File deleted successfully",
    };
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @Post("make-media-published/internal")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceToServiceGuard)
  async makeMediaPublished(@Body() body: { mediaId: string; userId: string }) {
    await this.fileMediaService.makeMediaPublished(body.mediaId, body.userId);

    return {
      success: true,
      message: "File published successfully",
    };
  }
}
