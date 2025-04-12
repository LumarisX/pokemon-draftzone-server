import { Response } from "express";
import { getSub, jwtCheck, Route, sendError, SubRequest } from ".";
import { getManagementToken } from "../services/auth0-services/auth0-service";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromIni } from "@aws-sdk/credential-provider-ini";

const s3 = new S3Client({
  region: "us-east-2",
  credentials: fromIni({ profile: "AdministratorAccess-446492582222" }),
});

export const UploadRoute: Route = {
  middleware: [jwtCheck, getSub],
  subpaths: {
    "/upload-url": {
      get: async (req, res) => {
        const { filename, contentType } = req.query;

        if (
          !filename ||
          typeof contentType !== "string" ||
          !contentType.startsWith("image/")
        ) {
          return res.status(400).json({ error: "Invalid file metadata" });
        }

        const key = `user-uploads/${Date.now()}-${filename}`;

        const command = new PutObjectCommand({
          Bucket: "pokemondraftzone-public",
          Key: key,
          ContentType: contentType,
          ACL: "public-read",
        });

        try {
          const url = await getSignedUrl(s3, command, {
            expiresIn: 120,
          });
          res.json({ url, key });
        } catch (error) {
          res.status(500).json({ error: "Error generating pre-signed URL" });
        }
      },
    },
    "/confirm-upload": {
      post: async (req, res) => {
        const { fileKey } = req.body;
        console.log(req.body);
        try {
          const command = new GetObjectCommand({
            Bucket: "pokemondraftzone-public",
            Key: fileKey,
          });
          const { ContentLength } = await s3.send(command);

          res.json({ message: "Upload verified", size: ContentLength });
        } catch (error) {
          console.log(error);
          res.status(400).json({ error: "File not found in S3" });
        }
      },
    },
  },
  params: {},
};
