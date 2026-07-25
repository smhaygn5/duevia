import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureRuntimeSchema,
  getDeliverablesBucket,
  getRawDb,
} from "@/db/runtime";
import { getWalletSession, sha256Bytes } from "@/lib/auth/server";

const metadataSchema = z.object({
  agreementRef: z.string().regex(/^DV-[A-Z0-9]{4,10}$/i),
  milestonePosition: z.coerce.number().int().min(1).max(50),
  submissionId: z.string().uuid(),
});

const allowedMediaTypes = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
]);
const maxFileSize = 10 * 1024 * 1024;

function safeFilename(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
  return cleaned || "deliverable";
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function matchesDeclaredType(bytes: Uint8Array, mediaType: string) {
  if (mediaType === "application/pdf") {
    return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  }
  if (
    mediaType === "application/zip" ||
    mediaType === "application/x-zip-compressed"
  ) {
    return (
      startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
    );
  }
  if (mediaType === "image/png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mediaType === "image/jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (mediaType === "image/webp") {
    return (
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (mediaType === "text/plain" || mediaType === "text/csv") {
    return !bytes.subarray(0, 8_192).includes(0);
  }
  return false;
}

export async function POST(request: NextRequest) {
  let uploadedKey: string | null = null;
  try {
    const session = await getWalletSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in before uploading a deliverable." },
        { status: 401 },
      );
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "file_required", message: "Choose a file to upload." },
        { status: 400 },
      );
    }
    const metadata = metadataSchema.parse({
      agreementRef: form.get("agreementRef"),
      milestonePosition: form.get("milestonePosition"),
      submissionId: form.get("submissionId"),
    });
    if (file.size <= 0 || file.size > maxFileSize) {
      return NextResponse.json(
        { error: "file_size", message: "Files must be between 1 byte and 10 MB." },
        { status: 413 },
      );
    }
    if (!allowedMediaTypes.has(file.type)) {
      return NextResponse.json(
        { error: "file_type", message: "This file type is not accepted." },
        { status: 415 },
      );
    }

    await ensureRuntimeSchema();
    const db = getRawDb();
    const access = await db
      .prepare(
        `SELECT
          agreements.id AS agreement_id,
          milestones.id AS milestone_id
        FROM agreements
        INNER JOIN milestones ON milestones.agreement_id = agreements.id
        WHERE agreements.public_ref = ?
          AND milestones.position = ?
          AND agreements.provider_wallet_id = ?
          AND agreements.contract_address IS NOT NULL
          AND agreements.state IN ('active', 'cancel_pending')
          AND milestones.state IN ('pending', 'in_progress', 'changes_requested')
        LIMIT 1`,
      )
      .bind(
        metadata.agreementRef.toUpperCase(),
        metadata.milestonePosition,
        session.walletId,
      )
      .first<{ agreement_id: string; milestone_id: string }>();
    if (!access) {
      return NextResponse.json(
        { error: "forbidden", message: "You cannot upload to this milestone." },
        { status: 403 },
      );
    }

    const bytes = await file.arrayBuffer();
    if (!matchesDeclaredType(new Uint8Array(bytes), file.type)) {
      return NextResponse.json(
        {
          error: "file_signature",
          message: "The file contents do not match the selected file type.",
        },
        { status: 415 },
      );
    }
    const contentHash = await sha256Bytes(bytes);
    const deliverableId = crypto.randomUUID();
    uploadedKey = `${access.agreement_id}/${access.milestone_id}/${deliverableId}-${safeFilename(file.name)}`;
    await getDeliverablesBucket().put(uploadedKey, bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        contentHash,
        walletId: session.walletId,
      },
    });

    const now = Date.now();
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO submissions (
            id, milestone_id, submission_hash, note, submitted_by_wallet_id,
            submitted_at, tx_hash, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          metadata.submissionId,
          access.milestone_id,
          contentHash,
          session.walletId,
          now,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO deliverables (
            id, submission_id, object_key, content_hash, original_name,
            media_type, size_bytes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          deliverableId,
          metadata.submissionId,
          uploadedKey,
          contentHash,
          file.name,
          file.type,
          file.size,
          now,
          now,
        ),
    ]);

    return NextResponse.json(
      {
        id: deliverableId,
        name: file.name,
        size: file.size,
        mediaType: file.type,
        contentHash,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey) {
      try {
        await getDeliverablesBucket().delete(uploadedKey);
      } catch {
        // A later maintenance pass can remove an orphan if cleanup is unavailable.
      }
    }
    return NextResponse.json(
      {
        error: "upload_failed",
        message: error instanceof Error ? error.message : "The file could not be uploaded.",
      },
      { status: 400 },
    );
  }
}
