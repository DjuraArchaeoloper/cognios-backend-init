import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  FileUploadOptions,
  FileUploadResult,
  ImageUploadOptions,
  ImageUploadResult,
  VIDEO_PURPOSE,
} from "./types/types";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
export const ALLOWED_FILE_TYPES = ["application/pdf"];

@Injectable()
export class MediaService {
  private readonly privateAccessKeyId: string | undefined;
  private readonly privateSecretAccessKey: string | undefined;
  private readonly publicAccessKeyId: string | undefined;
  private readonly publicSecretAccessKey: string | undefined;
  private readonly accountId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly bucketName: string | undefined;
  private readonly privateBucketName: string | undefined;
  private readonly apiBaseUrl: string;
  private readonly s3Client: S3Client;
  private readonly privateS3Client: S3Client;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.privateAccessKeyId = this.configService.get<string>(
      "R2_PRIVATE_ACCESS_KEY_ID",
    );
    this.privateSecretAccessKey = this.configService.get<string>(
      "R2_PRIVATE_SECRET_ACCESS_KEY",
    );

    this.publicAccessKeyId = this.configService.get<string>(
      "R2_PUBLIC_ACCESS_KEY_ID",
    );
    this.publicSecretAccessKey = this.configService.get<string>(
      "R2_PUBLIC_SECRET_ACCESS_KEY",
    );

    this.accountId = this.configService.get<string>("CF_ACCOUNT_ID");
    this.apiToken = this.configService.get<string>("CF_STREAM_API_TOKEN");
    this.bucketName = this.configService.get<string>("R2_PUBLIC_BUCKET_NAME");
    this.privateBucketName = this.configService.get<string>(
      "R2_PRIVATE_BUCKET_NAME",
    );

    if (!this.accountId || !this.apiToken)
      console.warn(
        "Cloudflare Stream configuration incomplete. Stream uploads may not work.",
      );

    if (!this.bucketName)
      console.warn(
        "R2 bucket name configuration incomplete. Some features may not work.",
      );

    if (
      !this.privateAccessKeyId ||
      !this.privateSecretAccessKey ||
      !this.publicAccessKeyId ||
      !this.publicSecretAccessKey
    )
      throw new BadRequestException("Missing access keys");

    this.apiBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`;

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.publicAccessKeyId,
        secretAccessKey: this.publicSecretAccessKey,
      },
    });

    this.privateS3Client = new S3Client({
      region: "auto",
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.privateAccessKeyId,
        secretAccessKey: this.privateSecretAccessKey,
      },
    });

    const publicUrl = this.configService.get<string>("R2_IMAGE_PUBLIC_URL")!;
    this.publicUrl = publicUrl;
  }

  // FILE
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

    if (!ALLOWED_FILE_TYPES.includes(mimeType))
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

      await this.privateS3Client.send(command);

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

      await this.privateS3Client.send(command);
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

  // IMAGE
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
      const sharpInstance = sharp(buffer).resize(
        Number(targetWidth),
        Number(targetHeight),
        {
          fit: "inside",
          withoutEnlargement: true,
        },
      );

      if (outputFormat === "jpeg") {
        processedBuffer = await sharpInstance
          .jpeg({ quality: Number(quality), mozjpeg: true })
          .toBuffer();
      } else if (outputFormat === "png") {
        processedBuffer = await sharpInstance
          .png({ quality: Number(quality), compressionLevel: 9 })
          .toBuffer();
      } else {
        processedBuffer = await sharpInstance
          .webp({ quality: Number(quality) })
          .toBuffer();
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

  // VIDEO

  async getTusUploadUrl(
    uploadLength: string,
    purpose: VIDEO_PURPOSE,
    uploadMetadata?: string,
  ): Promise<string> {
    const accountId = this.configService.get<string>("CF_ACCOUNT_ID") || "";
    const apiToken =
      this.configService.get<string>("CF_STREAM_API_TOKEN") || "";

    if (!accountId || !apiToken)
      throw new BadRequestException("Cloudflare Stream is not configured");

    let fileMimeType: string | null = null;

    if (uploadMetadata) {
      const metadataParts = uploadMetadata.split(",");

      for (const part of metadataParts) {
        const [key, value] = part.split(" ");
        if (key === "type" && value) {
          fileMimeType = Buffer.from(value, "base64").toString("utf8");
        }
      }
    }

    if (!fileMimeType || !ALLOWED_VIDEO_TYPES.includes(fileMimeType)) {
      throw new BadRequestException(
        "Only MP4 or QuickTime video files are allowed.",
      );
    }

    const length = Number(uploadLength);

    if (!Number.isFinite(length) || length <= 0)
      throw new BadRequestException("Upload length must be a positive number");

    const MAX_VIDEO_SIZE =
      purpose === VIDEO_PURPOSE.PROJECT_MAIN_VIDEO
        ? 1024 * 1024 * 1024
        : 100 * 1024 * 1024; // 1GB for main video, 100MB for preview video

    if (length > MAX_VIDEO_SIZE)
      throw new BadRequestException(
        `Video exceeds maximum allowed size (${MAX_VIDEO_SIZE / 1024 / 1024}MB)`,
      );

    const requireSignedURLs =
      purpose === VIDEO_PURPOSE.PROJECT_MAIN_VIDEO ? true : false;

    const maxDurationSeconds =
      purpose === VIDEO_PURPOSE.PROJECT_MAIN_VIDEO ? 3600 : 30; // 1 hour for main video, 30 seconds for preview video

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiToken}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(length),
      };

      const metadataParts: string[] = [];

      if (uploadMetadata) {
        metadataParts.push(uploadMetadata);
      }

      const maxDurationBase64 = Buffer.from(
        String(maxDurationSeconds),
      ).toString("base64");

      metadataParts.push(`maxDurationSeconds ${maxDurationBase64}`);

      if (requireSignedURLs) {
        metadataParts.push("requiresignedurls");
      }

      const expiryDate = new Date(
        Date.now() + 23 * 60 * 60 * 1000,
      ).toISOString();

      const expiryBase64 = Buffer.from(expiryDate).toString("base64");
      metadataParts.push(`expiry ${expiryBase64}`);

      headers["Upload-Metadata"] = metadataParts.join(",");

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(
          `Failed to create tus upload URL: ${JSON.stringify(errorData)}`,
        );
        throw new BadRequestException(
          errorData.errors?.[0]?.message ||
            "Failed to create Cloudflare Stream tus upload URL",
        );
      }

      const uploadUrl = response.headers.get("Location");
      if (!uploadUrl) {
        throw new BadRequestException(
          "Cloudflare Stream did not return an upload URL",
        );
      }

      return uploadUrl;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error(`Error creating tus upload URL: ${error}`);
      throw new BadRequestException("Failed to create tus upload URL");
    }
  }

  private async clipVideo(
    clippedFromVideoUID: string,
    startTimeSeconds: number,
    endTimeSeconds: number,
    options?: {
      name?: string;
      thumbnailTimestampPct?: number;
    },
  ): Promise<any> {
    if (!clippedFromVideoUID)
      throw new BadRequestException("Source video UID is required");

    if (startTimeSeconds < 0)
      throw new BadRequestException("Start time must be >= 0");

    if (endTimeSeconds <= startTimeSeconds)
      throw new BadRequestException("End time must be greater than start time");

    const requestBody: {
      clippedFromVideoUID: string;
      startTimeSeconds: number;
      endTimeSeconds: number;
      meta?: { name?: string };
    } = {
      clippedFromVideoUID,
      startTimeSeconds,
      endTimeSeconds,
    };

    if (options?.name) requestBody.meta = { name: options.name };

    const response = await fetch(`${this.apiBaseUrl}/clip`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new BadRequestException(
        errorData.errors?.[0]?.message || "Failed to create video clip",
      );
    }

    const data = await response.json();

    if (!data.success)
      throw new BadRequestException(
        data.errors?.[0]?.message || "Failed to create video clip",
      );

    const result = data.result;

    return result;
  }

  async createPreviewVideo(
    originalVideoUID: string,
    originalVideoName: string,
  ): Promise<any> {
    const MIN_PREVIEW_DURATION = 8;
    const MAX_PREVIEW_DURATION = 30;
    const PREVIEW_PERCENTAGE = 0.15;

    if (!originalVideoUID)
      throw new BadRequestException("Video UID is required");

    const originalVideo = await this.getVideoDetails(originalVideoUID);

    if (!originalVideo.readyToStream)
      throw new BadRequestException("Video is not ready for preview creation");

    const originalDuration = originalVideo.duration;
    const calculatedPreview = Math.floor(originalDuration * PREVIEW_PERCENTAGE);

    if (!originalDuration || originalDuration <= 0)
      throw new BadRequestException("Invalid original video duration");

    const duration = Math.min(
      MAX_PREVIEW_DURATION,
      Math.max(MIN_PREVIEW_DURATION, calculatedPreview),
    );

    const startTime = Math.floor(originalDuration * 0.1);
    const endTimeSeconds = startTime + duration;

    const previewVideo = await this.clipVideo(
      originalVideoUID,
      startTime,
      endTimeSeconds,
      {
        name: `(PREVIEW) - ${originalVideoName}`,
        thumbnailTimestampPct: 0.1,
      },
    );

    return previewVideo;
  }

  async getVideoDetails(videoUID: string): Promise<any> {
    const response = await fetch(`${this.apiBaseUrl}/${videoUID}`, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException("Failed to fetch video details");
    }

    const data = await response.json();

    if (!data.success) {
      throw new BadRequestException("Failed to fetch video details");
    }

    return data.result;
  }

  async generateTokenForStreamVideos(
    videoUid: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    if (!videoUid) throw new BadRequestException("Video UID is required");

    const maxExpiration = 86400;
    const expiration = Math.min(expiresInSeconds, maxExpiration);

    try {
      const response = await fetch(`${this.apiBaseUrl}/${videoUid}/token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + expiration,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(
          `Failed to generate signed token: ${JSON.stringify(errorData)}`,
        );
        throw new BadRequestException(
          errorData.errors?.[0]?.message || "Failed to generate signed token",
        );
      }

      const data = await response.json();

      if (!data.success)
        throw new BadRequestException(
          data.errors?.[0]?.message || "Failed to generate signed token",
        );

      const token = data.result?.token;
      if (!token) throw new BadRequestException("Token not found in response");

      return token;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Failed to generate signed token");
    }
  }

  async generateSignedUrl(
    fileKey: string,
    expiresIn: number = 600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.privateBucketName,
        Key: fileKey,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      return signedUrl;
    } catch (error) {
      console.error(`Error generating signed URL for ${fileKey}:`, error);
      throw new BadRequestException("Failed to generate signed URL");
    }
  }
}
