export type QrStatus = "active" | "disabled";

export type QrRow = {
  created_at: string;
  destination_url: string;
  owner_id: string | null;
  scan_count: number;
  slug: string;
  status: QrStatus;
  title: string | null;
  updated_at: string;
};

export type QrCode = {
  createdAt: string;
  destinationUrl: string;
  ownerId: string | null;
  scanCount: number;
  slug: string;
  status: QrStatus;
  title: string | null;
  updatedAt: string;
};

export function mapQrRow(row: QrRow): QrCode {
  return {
    createdAt: row.created_at,
    destinationUrl: row.destination_url,
    ownerId: row.owner_id,
    scanCount: row.scan_count,
    slug: row.slug,
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at,
  };
}
