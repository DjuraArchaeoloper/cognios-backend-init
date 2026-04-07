import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MediaService {
  private readonly accessKeyId: string | undefined;
  private readonly secretAccessKey: string | undefined;
  private readonly accountId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly bucketName: string | undefined;
  private readonly privateBucketName: string | undefined;
  private readonly apiBaseUrl: string;
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.accessKeyId = this.configService.get<string>(
      "R2_PRIVATE_ACCESS_KEY_ID",
    );
    this.secretAccessKey = this.configService.get<string>(
      "R2_PRIVATE_SECRET_ACCESS_KEY",
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

    if (!this.accessKeyId || !this.secretAccessKey)
      throw new BadRequestException("Missing access keys");

    this.apiBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`;

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
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
