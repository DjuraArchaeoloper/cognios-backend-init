import { Injectable, BadRequestException } from "@nestjs/common";
import {
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { PDFDocument } from "pdf-lib";

export interface FileUploadOptions {
  folder?: string;
  maxSize?: number;
}

export interface FileUploadResult {
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export const ALLOWED_TYPES = ["application/pdf"];

@Injectable()
export class FileService {
  private readonly s3Client: S3Client;
  private readonly privateBucketName: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>("CF_ACCOUNT_ID");
    const accessKeyId = this.configService.get<string>(
      "R2_PRIVATE_ACCESS_KEY_ID",
    );
    const secretAccessKey = this.configService.get<string>(
      "R2_PRIVATE_SECRET_ACCESS_KEY",
    );
    const bucket = this.configService.get<string>("R2_PRIVATE_BUCKET_NAME")!;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      console.warn("R2 configuration incomplete. Some features may not work.");
    }

    this.privateBucketName = bucket;

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || "",
        secretAccessKey: secretAccessKey || "",
      },
    });
  }

  private sanitizeFileName(name: string): string {
    const cleaned = name
      .normalize("NFKD")
      .replace(/[^\w\d.\- ]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    return cleaned || "document.pdf";
  }

  async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    options: FileUploadOptions = {},
  ): Promise<FileUploadResult> {
    const { folder = "files", maxSize } = options;

    if (!buffer) throw new BadRequestException("File is required");

    if (!ALLOWED_TYPES.includes(mimeType))
      throw new BadRequestException(`Only PDF files are allowed`);

    if (maxSize && buffer.length > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
      );
    }

    const safeName = this.sanitizeFileName(originalName);
    let finalBuffer = buffer;

    if (mimeType === "application/pdf") {
      try {
        const pdfDoc = await PDFDocument.load(buffer);
        pdfDoc.setTitle(safeName);
        finalBuffer = Buffer.from(await pdfDoc.save());
      } catch {
        throw new BadRequestException("Invalid or corrupted PDF file");
      }
    }

    try {
      const fileExtension = this.getFileExtensionFromMime(mimeType);
      const fileKey = `${folder}/${randomUUID()}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: this.privateBucketName,
        Key: fileKey,
        Body: finalBuffer,
        ContentType: mimeType,
        CacheControl: "private, no-store",
        ContentDisposition: `inline; filename="${safeName}"`,
      });

      await this.s3Client.send(command);

      return {
        fileKey,
        fileName: safeName,
        fileSize: finalBuffer.length,
        mimeType,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to upload file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async deleteFile(fileKey: string): Promise<void> {
    if (!fileKey) throw new BadRequestException("File is required");

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.privateBucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);
    } catch (error) {
      throw new BadRequestException(
        `Failed to delete file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private getFileExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      "application/pdf": "pdf",
    };

    const ext = mimeToExt[mimeType];

    if (!ext) {
      throw new BadRequestException("Unsupported file type");
    }

    return ext;
  }
}
