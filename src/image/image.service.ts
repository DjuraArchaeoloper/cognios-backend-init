import { Injectable, BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";

export interface ImageUploadOptions {
  folder?: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: "jpeg" | "png" | "webp";
}

export interface ImageUploadResult {
  url: string;
  fileKey: string;
  width: number;
  height: number;
  size: number;
  fileId: string;
}

@Injectable()
export class ImageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>("CF_ACCOUNT_ID");
    const accessKeyId = this.configService.get<string>(
      "R2_PUBLIC_ACCESS_KEY_ID",
    );
    const secretAccessKey = this.configService.get<string>(
      "R2_PUBLIC_SECRET_ACCESS_KEY",
    );
    const bucket = this.configService.get<string>("R2_PUBLIC_BUCKET_NAME")!;
    const publicUrl = this.configService.get<string>("R2_IMAGE_PUBLIC_URL")!;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      console.warn("R2 configuration incomplete. Some features may not work.");
    }

    this.bucketName = bucket;
    this.publicUrl = publicUrl;

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || "",
        secretAccessKey: secretAccessKey || "",
      },
    });
  }

  async uploadImage(
    buffer: Buffer,
    mimeType: string,
    options: ImageUploadOptions = {},
  ): Promise<ImageUploadResult> {
    const {
      folder = "images",
      maxWidth = 1920,
      maxHeight = 1920,
      quality = 85,
      format,
    } = options;

    if (!buffer) throw new BadRequestException("Image is required");
    if (buffer.length > 20 * 1024 * 1024)
      throw new BadRequestException("Image too large");

    if (!mimeType.startsWith("image/"))
      throw new BadRequestException("File must be an image");

    try {
      const metadata = await sharp(buffer).metadata();

      if (!metadata.format)
        throw new BadRequestException("File must be an image");

      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      if (originalWidth === 0 || originalHeight === 0) {
        throw new BadRequestException("Invalid image file");
      }

      const outputFormat =
        format ||
        (mimeType === "image/png"
          ? "png"
          : mimeType === "image/webp"
            ? "webp"
            : "jpeg");

      let targetWidth = originalWidth;
      let targetHeight = originalHeight;

      if (originalWidth > maxWidth || originalHeight > maxHeight) {
        const aspectRatio = originalWidth / originalHeight;
        if (originalWidth > originalHeight) {
          targetWidth = maxWidth;
          targetHeight = Math.round(maxWidth / aspectRatio);
          if (targetHeight > maxHeight) {
            targetHeight = maxHeight;
            targetWidth = Math.round(maxHeight * aspectRatio);
          }
        } else {
          targetHeight = maxHeight;
          targetWidth = Math.round(maxHeight * aspectRatio);
          if (targetWidth > maxWidth) {
            targetWidth = maxWidth;
            targetHeight = Math.round(maxWidth / aspectRatio);
          }
        }
      }

      let processedBuffer: Buffer;
      const sharpInstance = sharp(buffer).resize(targetWidth, targetHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });

      if (outputFormat === "jpeg") {
        processedBuffer = await sharpInstance
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      } else if (outputFormat === "png") {
        processedBuffer = await sharpInstance
          .png({ quality, compressionLevel: 9 })
          .toBuffer();
      } else {
        processedBuffer = await sharpInstance.webp({ quality }).toBuffer();
      }

      const fileId = randomUUID();
      const fileExtension = outputFormat === "jpeg" ? "jpg" : outputFormat;
      const fileKey = `${folder}/${fileId}.${fileExtension}`;
      const contentType = `image/${outputFormat}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: processedBuffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      });

      await this.s3Client.send(command);

      const publicUrl = this.publicUrl + "/" + fileKey;

      return {
        url: publicUrl,
        fileKey,
        width: targetWidth,
        height: targetHeight,
        size: processedBuffer.length,
        fileId,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to process image: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async deleteImage(fileKey: string): Promise<void> {
    if (!fileKey) throw new BadRequestException("Image is required");
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);
    } catch (error) {
      throw new BadRequestException(
        `Failed to delete image: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
