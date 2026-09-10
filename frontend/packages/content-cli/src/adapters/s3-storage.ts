import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ObjectStoragePort } from "../ports";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  publicBaseUrl?: string;
}

export function createS3Storage(config: S3StorageConfig): ObjectStoragePort {
  if (config.bucket === "" || config.region === "") {
    throw new Error(
      "CONTENT_S3_BUCKET and CONTENT_S3_REGION are required for publish",
    );
  }
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint === undefined
      ? {}
      : { endpoint: config.endpoint, forcePathStyle: true }),
  });

  return {
    async upload(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      if (config.publicBaseUrl !== undefined) {
        return new URL(key, `${config.publicBaseUrl.replace(/\/$/, "")}/`).toString();
      }
      return `s3://${config.bucket}/${key}`;
    },
  };
}
