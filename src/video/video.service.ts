import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { VIDEO_PURPOSE } from "./types/types";

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];

@Injectable()
export class VideoService {
  private readonly accountId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly apiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.accountId = this.configService.get<string>("CF_ACCOUNT_ID");
    this.apiToken = this.configService.get<string>("CF_STREAM_API_TOKEN");

    if (!this.accountId || !this.apiToken)
      console.warn(
        "Cloudflare Stream configuration incomplete. Stream uploads may not work.",
      );

    this.apiBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`;
  }

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
      purpose === VIDEO_PURPOSE.GUIDE_MAIN_VIDEO
        ? 1024 * 1024 * 1024
        : 100 * 1024 * 1024; // 1GB for main video, 100MB for preview video

    if (length > MAX_VIDEO_SIZE)
      throw new BadRequestException(
        `Video exceeds maximum allowed size (${MAX_VIDEO_SIZE / 1024 / 1024}MB)`,
      );

    const requireSignedURLs =
      purpose === VIDEO_PURPOSE.GUIDE_MAIN_VIDEO ? true : false;

    const maxDurationSeconds =
      purpose === VIDEO_PURPOSE.GUIDE_MAIN_VIDEO ? 3600 : 30; // 1 hour for main video, 30 seconds for preview video

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
}
