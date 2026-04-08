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
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadFileDto } from "./dto/upload-file.dto";
import { MulterFile } from "../types/media";
import { InternalAuthGuard } from "src/common/guards/auth.guard";

@Controller("file")
export class FileController {
  constructor(private readonly fileService: FileService) {}

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
}
